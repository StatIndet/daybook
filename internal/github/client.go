package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/StatIndet/daybook/internal/config"
)

const maxResponseBytes = 8 << 20

type Client struct {
	HTTP       *http.Client
	BaseURL    string
	GraphQLURL string
	Token      string
}

func NewClient(token string) *Client {
	return &Client{HTTP: &http.Client{Timeout: 15 * time.Second}, BaseURL: "https://api.github.com", GraphQLURL: "https://api.github.com/graphql", Token: token}
}

type APIError struct {
	StatusCode int
	Endpoint   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("GitHub %s returned HTTP %d", e.Endpoint, e.StatusCode)
}
func absent(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == 404
}

func (c *Client) request(ctx context.Context, method, endpoint, accept string, body []byte) ([]byte, http.Header, error) {
	target := strings.TrimRight(c.BaseURL, "/") + endpoint
	if method == http.MethodPost {
		target = c.GraphQLURL
	}
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("User-Agent", "Daybook-GitHub-Profile")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("GitHub %s request failed: %w", endpoint, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, res.Header, &APIError{StatusCode: res.StatusCode, Endpoint: endpoint}
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxResponseBytes+1))
	if err != nil {
		return nil, nil, err
	}
	if len(data) > maxResponseBytes {
		return nil, nil, fmt.Errorf("GitHub %s response exceeds size limit", endpoint)
	}
	return data, res.Header, nil
}

func (c *Client) get(ctx context.Context, endpoint string, out any) error {
	data, _, err := c.request(ctx, http.MethodGet, endpoint, "application/vnd.github+json", nil)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decode GitHub %s: %w", endpoint, err)
	}
	return nil
}

// Sync always requests fresh public data. A cache outside public/ survives a
// clean build and provides the last complete profile when GitHub is offline.
func Sync(ctx context.Context, cfg config.GitHubConfig, cacheDir string) (*Profile, []string, error) {
	if cfg.Username == "" {
		return nil, nil, nil
	}
	tokenEnv := cfg.TokenEnv
	if tokenEnv == "" {
		tokenEnv = "GITHUB_TOKEN"
	}
	return NewClient(os.Getenv(tokenEnv)).Sync(ctx, cfg.Username, cacheDir)
}

func (c *Client) Sync(ctx context.Context, username, cacheDir string) (*Profile, []string, error) {
	cachePath := filepath.Join(cacheDir, strings.ToLower(username)+".json")
	var cached *Profile
	if data, err := os.ReadFile(cachePath); err == nil {
		var p Profile
		if json.Unmarshal(data, &p) == nil && strings.EqualFold(p.Login, username) {
			sanitizeProfile(&p)
			cached = &p
		}
	}
	p, warnings, err := c.Fetch(ctx, username, cached)
	if err != nil {
		if cached != nil {
			cached.Cached = true
			return cached, []string{err.Error() + "; using cached profile from " + cached.FetchedAt}, nil
		}
		return nil, nil, err
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return nil, warnings, err
	}
	if err := os.MkdirAll(cacheDir, 0755); err == nil {
		file, err := os.CreateTemp(cacheDir, ".github-*.json")
		if err == nil {
			name := file.Name()
			_, writeErr := file.Write(data)
			closeErr := file.Close()
			if writeErr == nil && closeErr == nil {
				err = os.Rename(name, cachePath)
			} else {
				err = errors.Join(writeErr, closeErr)
			}
			os.Remove(name)
		}
		if err != nil {
			warnings = append(warnings, "could not persist GitHub cache: "+err.Error())
		}
	} else {
		warnings = append(warnings, "could not create GitHub cache: "+err.Error())
	}
	return p, warnings, nil
}

func (c *Client) Fetch(ctx context.Context, username string, cached *Profile) (*Profile, []string, error) {
	prefix := "/users/" + url.PathEscape(username)
	var user struct {
		Login           string `json:"login"`
		Name            string `json:"name"`
		Bio             string `json:"bio"`
		AvatarURL       string `json:"avatar_url"`
		HTMLURL         string `json:"html_url"`
		Company         string `json:"company"`
		Blog            string `json:"blog"`
		Location        string `json:"location"`
		Email           string `json:"email"`
		TwitterUsername string `json:"twitter_username"`
		Followers       int    `json:"followers"`
		Following       int    `json:"following"`
		PublicRepos     int    `json:"public_repos"`
		PublicGists     int    `json:"public_gists"`
		CreatedAt       string `json:"created_at"`
		UpdatedAt       string `json:"updated_at"`
	}
	if err := c.get(ctx, prefix, &user); err != nil {
		return nil, nil, err
	}
	if !strings.EqualFold(user.Login, username) {
		return nil, nil, fmt.Errorf("GitHub response does not match configured username")
	}
	p := &Profile{}
	if cached != nil {
		*p = *cached
	}
	p.Cached = false
	p.Login, p.Name, p.Bio = user.Login, user.Name, user.Bio
	p.AvatarURL, p.HTMLURL = user.AvatarURL, user.HTMLURL
	p.Company, p.Blog, p.Location, p.Email = user.Company, user.Blog, user.Location, user.Email
	p.TwitterUsername, p.Followers, p.Following = user.TwitterUsername, user.Followers, user.Following
	p.PublicRepos, p.PublicGists, p.CreatedAt, p.UpdatedAt = user.PublicRepos, user.PublicGists, user.CreatedAt, user.UpdatedAt
	p.FetchedAt = time.Now().UTC().Format(time.RFC3339)
	var warnings []string
	var mu sync.Mutex
	var wg sync.WaitGroup
	run := func(f func() error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := f(); err != nil {
				mu.Lock()
				warnings = append(warnings, err.Error())
				mu.Unlock()
			}
		}()
	}
	run(func() error {
		var accounts []SocialAccount
		if err := c.get(ctx, prefix+"/social_accounts?per_page=100", &accounts); err != nil {
			if absent(err) {
				p.SocialAccounts = nil
				return nil
			}
			return err
		}
		p.SocialAccounts = accounts
		return nil
	})
	run(func() error {
		var orgs []struct {
			Login       string `json:"login"`
			AvatarURL   string `json:"avatar_url"`
			Description string `json:"description"`
		}
		if err := c.get(ctx, prefix+"/orgs?per_page=100", &orgs); err != nil {
			return err
		}
		p.Organizations = nil
		for _, org := range orgs {
			p.Organizations = append(p.Organizations, Organization{Login: org.Login, AvatarURL: org.AvatarURL, Description: org.Description, HTMLURL: "https://github.com/" + org.Login})
		}
		return nil
	})
	run(func() error {
		repos, err := c.repositories(ctx, prefix)
		if err == nil {
			p.Repositories = repos
		}
		return err
	})
	run(func() error {
		events, err := c.events(ctx, prefix)
		if err == nil {
			p.Events = events
		}
		return err
	})
	run(func() error {
		endpoint := "/repos/" + url.PathEscape(username) + "/" + url.PathEscape(username) + "/readme"
		// A profile repository can be private. Read it as an anonymous visitor
		// even when the configured token has wider repository permissions.
		publicClient := *c
		publicClient.Token = ""
		data, _, err := publicClient.request(ctx, http.MethodGet, endpoint, "application/vnd.github.html+json", nil)
		if absent(err) {
			p.ReadmeHTML, p.ReadmeURL = "", ""
			return nil
		}
		if err != nil {
			return err
		}
		p.ReadmeURL = "https://github.com/" + username + "/" + username + "#readme"
		p.ReadmeHTML = cleanReadme(string(data), username)
		return nil
	})
	run(func() error {
		publicClient := *c
		publicClient.Token = ""
		data, headers, err := publicClient.request(ctx, http.MethodGet, prefix+"/starred?per_page=1", "application/vnd.github+json", nil)
		if err != nil {
			return err
		}
		var stars []json.RawMessage
		if err := json.Unmarshal(data, &stars); err != nil {
			return err
		}
		p.Stars = len(stars)
		for _, link := range strings.Split(headers.Get("Link"), ",") {
			if !strings.Contains(link, `rel="last"`) {
				continue
			}
			start, end := strings.Index(link, "<"), strings.Index(link, ">")
			if start < 0 || end < start {
				continue
			}
			u, err := url.Parse(link[start+1 : end])
			if err == nil {
				fmt.Sscan(u.Query().Get("page"), &p.Stars)
			}
		}
		p.StarsAvailable = true
		return nil
	})
	wg.Wait()
	if c.Token != "" {
		if err := c.graphQL(ctx, p); err != nil {
			warnings = append(warnings, err.Error())
		}
	}
	sanitizeProfile(p)
	return p, warnings, nil
}

func (c *Client) repositories(ctx context.Context, prefix string) ([]Repository, error) {
	var all []Repository
	for page := 1; page <= 100; page++ {
		var repos []struct {
			Name        string   `json:"name"`
			FullName    string   `json:"full_name"`
			HTMLURL     string   `json:"html_url"`
			Description string   `json:"description"`
			Language    string   `json:"language"`
			Stars       int      `json:"stargazers_count"`
			Forks       int      `json:"forks_count"`
			Archived    bool     `json:"archived"`
			Fork        bool     `json:"fork"`
			Private     bool     `json:"private"`
			Topics      []string `json:"topics"`
			UpdatedAt   string   `json:"updated_at"`
			Homepage    string   `json:"homepage"`
		}
		if err := c.get(ctx, fmt.Sprintf("%s/repos?type=owner&sort=updated&per_page=100&page=%d", prefix, page), &repos); err != nil {
			return nil, err
		}
		for _, r := range repos {
			if r.Private {
				continue
			}
			all = append(all, Repository{Name: r.Name, FullName: r.FullName, HTMLURL: r.HTMLURL, Description: r.Description, Language: r.Language, Stars: r.Stars, Forks: r.Forks, Archived: r.Archived, Fork: r.Fork, Topics: r.Topics, UpdatedAt: r.UpdatedAt, Homepage: r.Homepage})
		}
		if len(repos) < 100 {
			return all, nil
		}
	}
	return nil, fmt.Errorf("GitHub repository pagination exceeded 100 pages")
}

func (c *Client) events(ctx context.Context, prefix string) ([]Event, error) {
	var input []struct {
		Type      string `json:"type"`
		Public    bool   `json:"public"`
		CreatedAt string `json:"created_at"`
		Repo      struct {
			Name string `json:"name"`
		} `json:"repo"`
		Payload struct {
			Action string `json:"action"`
			Ref    string `json:"ref"`
			Issue  struct {
				HTMLURL string `json:"html_url"`
				Title   string `json:"title"`
			} `json:"issue"`
			PullRequest struct {
				HTMLURL string `json:"html_url"`
				Title   string `json:"title"`
			} `json:"pull_request"`
			Release struct {
				HTMLURL string `json:"html_url"`
				Name    string `json:"name"`
			} `json:"release"`
		} `json:"payload"`
	}
	if err := c.get(ctx, prefix+"/events/public?per_page=30", &input); err != nil {
		return nil, err
	}
	var events []Event
	for _, e := range input {
		if !e.Public {
			continue
		}
		repoURL := "https://github.com/" + e.Repo.Name
		item := Event{Type: e.Type, RepoName: e.Repo.Name, RepoURL: repoURL, URL: repoURL, CreatedAt: e.CreatedAt}
		switch e.Type {
		case "PushEvent":
			item.Summary = "Pushed to " + strings.TrimPrefix(e.Payload.Ref, "refs/heads/")
		case "WatchEvent":
			item.Summary = "Starred repository"
		case "ForkEvent":
			item.Summary = "Forked repository"
		case "IssuesEvent":
			item.Summary = e.Payload.Action + " issue: " + e.Payload.Issue.Title
			item.URL = e.Payload.Issue.HTMLURL
		case "PullRequestEvent":
			item.Summary = e.Payload.Action + " pull request: " + e.Payload.PullRequest.Title
			item.URL = e.Payload.PullRequest.HTMLURL
		case "ReleaseEvent":
			item.Summary = e.Payload.Action + " release: " + e.Payload.Release.Name
			item.URL = e.Payload.Release.HTMLURL
		case "CreateEvent":
			item.Summary = "Created " + e.Payload.Ref
		default:
			item.Summary = strings.TrimSuffix(e.Type, "Event")
		}
		events = append(events, item)
	}
	return events, nil
}
