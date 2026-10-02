package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Only public repositories are retained. No token or private repository data is
// written to the static snapshot; authentication enables GitHub's profile API.
const profileQuery = `query DaybookProfile($login: String!) {
  user(login: $login) {
    pronouns
    pinnedItems(first: 6, types: [REPOSITORY]) {
      nodes { ... on Repository { name nameWithOwner url description isPrivate isArchived isFork stargazerCount forkCount updatedAt homepageUrl primaryLanguage { name color } repositoryTopics(first: 20) { nodes { topic { name } } } } }
    }
    status { emoji message }
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
    }
  }
}`

func (c *Client) graphQL(ctx context.Context, p *Profile) error {
	body, err := json.Marshal(map[string]any{"query": profileQuery, "variables": map[string]string{"login": p.Login}})
	if err != nil {
		return err
	}
	data, _, err := c.request(ctx, http.MethodPost, "/graphql", "application/json", body)
	if err != nil {
		return err
	}
	var response struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
		Data struct {
			User *struct {
				Pronouns    string `json:"pronouns"`
				PinnedItems struct {
					Nodes []struct {
						Name            string `json:"name"`
						FullName        string `json:"nameWithOwner"`
						URL             string `json:"url"`
						Description     string `json:"description"`
						Private         bool   `json:"isPrivate"`
						Archived        bool   `json:"isArchived"`
						Fork            bool   `json:"isFork"`
						Stars           int    `json:"stargazerCount"`
						Forks           int    `json:"forkCount"`
						UpdatedAt       string `json:"updatedAt"`
						Homepage        string `json:"homepageUrl"`
						PrimaryLanguage *struct {
							Name  string `json:"name"`
							Color string `json:"color"`
						} `json:"primaryLanguage"`
						Topics struct {
							Nodes []struct {
								Topic struct {
									Name string `json:"name"`
								} `json:"topic"`
							} `json:"nodes"`
						} `json:"repositoryTopics"`
					} `json:"nodes"`
				} `json:"pinnedItems"`
				Stars struct {
					Total int `json:"totalCount"`
				} `json:"starredRepositories"`
				Status        *Status `json:"status"`
				Contributions struct {
					Calendar struct {
						Total int `json:"totalContributions"`
						Weeks []struct {
							Days []struct {
								Date  string `json:"date"`
								Count int    `json:"contributionCount"`
								Level string `json:"contributionLevel"`
							} `json:"contributionDays"`
						} `json:"weeks"`
					} `json:"contributionCalendar"`
				} `json:"contributionsCollection"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return fmt.Errorf("decode GitHub GraphQL: %w", err)
	}
	// Do not overwrite the cached enhanced fields with partial GraphQL output.
	if len(response.Errors) > 0 {
		return fmt.Errorf("GitHub GraphQL could not load enhanced public profile data")
	}
	u := response.Data.User
	if u == nil {
		return fmt.Errorf("GitHub GraphQL user not found")
	}
	p.Pronouns = u.Pronouns
	p.PinnedRepositories = nil
	for _, repo := range u.PinnedItems.Nodes {
		if repo.Private || repo.Name == "" {
			continue
		}
		r := Repository{Name: repo.Name, FullName: repo.FullName, HTMLURL: repo.URL, Description: repo.Description, Archived: repo.Archived, Fork: repo.Fork, Stars: repo.Stars, Forks: repo.Forks, UpdatedAt: repo.UpdatedAt, Homepage: repo.Homepage}
		if repo.PrimaryLanguage != nil {
			r.Language, r.LanguageColor = repo.PrimaryLanguage.Name, repo.PrimaryLanguage.Color
		}
		for _, topic := range repo.Topics.Nodes {
			r.Topics = append(r.Topics, topic.Topic.Name)
		}
		p.PinnedRepositories = append(p.PinnedRepositories, r)
	}
	// Keep the public REST star count; an authenticated GraphQL total can also
	// include stars on repositories visible only to the token's owner.
	p.Status = u.Status
	calendar := u.Contributions.Calendar
	p.Contributions = &Contributions{Total: calendar.Total}
	levels := map[string]int{"NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2, "THIRD_QUARTILE": 3, "FOURTH_QUARTILE": 4}
	for _, inputWeek := range calendar.Weeks {
		week := ContributionWeek{}
		for _, day := range inputWeek.Days {
			week.Days = append(week.Days, ContributionDay{Date: day.Date, Count: day.Count, Level: levels[day.Level]})
		}
		p.Contributions.Weeks = append(p.Contributions.Weeks, week)
	}
	// REST does not provide language colors. Enrich matching repositories with
	// the official language metadata already returned for the pinned cards.
	for i := range p.Repositories {
		for _, r := range p.PinnedRepositories {
			if p.Repositories[i].FullName == r.FullName {
				p.Repositories[i].LanguageColor = r.LanguageColor
			}
		}
	}
	return nil
}
