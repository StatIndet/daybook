package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mockClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	c := NewClient("")
	c.BaseURL, c.GraphQLURL = server.URL, server.URL+"/graphql"
	return c
}

func serveProfile(w http.ResponseWriter) {
	fmt.Fprint(w, `{"login":"example","name":"Current Name","bio":"Current GitHub bio","avatar_url":"https://avatars.githubusercontent.com/u/1?v=4","html_url":"https://github.com/example","blog":"example.com","public_repos":2,"followers":5,"following":3}`)
}

func TestSyncFreshPublicDataAndOfflineCache(t *testing.T) {
	cacheDir := t.TempDir()
	fail := false
	c := mockClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-GitHub-Api-Version") != "2022-11-28" {
			t.Errorf("missing API version")
		}
		if fail {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		switch r.URL.Path {
		case "/users/example":
			serveProfile(w)
		case "/users/example/repos":
			fmt.Fprint(w, `[{"name":"visible","full_name":"example/visible","html_url":"https://github.com/example/visible","private":false},{"name":"secret","full_name":"example/secret","private":true}]`)
		case "/users/example/events/public":
			fmt.Fprint(w, `[{"type":"WatchEvent","public":true,"repo":{"name":"example/visible"}},{"type":"PushEvent","public":false,"repo":{"name":"example/secret"}}]`)
		case "/users/example/starred":
			w.Header().Set("Link", `<https://api.github.com/users/example/starred?per_page=1&page=42>; rel="last"`)
			fmt.Fprint(w, `[{}]`)
		case "/repos/example/example/readme":
			fmt.Fprint(w, `<h1>Public README</h1><script>bad()</script><img src="images/hello.png" onerror="bad()"><a href="javascript:bad()">Unsafe</a>`)
		default:
			fmt.Fprint(w, `[]`)
		}
	})
	p, warnings, err := c.Sync(context.Background(), "example", cacheDir)
	if err != nil || len(warnings) != 0 {
		t.Fatalf("sync: %v, %v", err, warnings)
	}
	if p.Bio != "Current GitHub bio" || p.Stars != 42 || !p.StarsAvailable {
		t.Fatalf("bad upstream profile: %#v", p)
	}
	if len(p.Repositories) != 1 || len(p.Events) != 1 {
		t.Fatalf("private data not filtered: %#v", p)
	}
	if strings.Contains(string(p.ReadmeHTML), "script") || strings.Contains(string(p.ReadmeHTML), "onerror") || strings.Contains(string(p.ReadmeHTML), "javascript:") {
		t.Fatalf("unsafe README: %s", p.ReadmeHTML)
	}
	if !strings.Contains(string(p.ReadmeHTML), "https://raw.githubusercontent.com/example/example/HEAD/images/hello.png") {
		t.Fatalf("relative image not resolved: %s", p.ReadmeHTML)
	}
	if p.Blog != "https://example.com" || !strings.Contains(p.AvatarSrcSet(), "s=520") {
		t.Fatalf("URLs not normalized")
	}
	fail = true
	cached, warnings, err := c.Sync(context.Background(), "example", cacheDir)
	if err != nil || !cached.Cached || cached.Bio != p.Bio || len(warnings) != 1 {
		t.Fatalf("cache fallback: %#v, %v, %v", cached, warnings, err)
	}
	if cached.FetchedAt != p.FetchedAt {
		t.Fatal("offline cache must preserve actual fetch date")
	}
	if _, _, err := c.Sync(context.Background(), "other", cacheDir); err == nil {
		t.Fatal("cold failure should fail without another user's cache")
	}
}

func TestOptionalErrorsPreserveCacheAnd404ClearsReadme(t *testing.T) {
	c := mockClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users/example" {
			serveProfile(w)
			return
		}
		if r.URL.Path == "/repos/example/example/readme" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusForbidden)
	})
	old := &Profile{Login: "example", Bio: "Old bio", ReadmeHTML: "Old README", Repositories: []Repository{{Name: "last-success", HTMLURL: "https://github.com/example/last-success"}}}
	p, warnings, err := c.Fetch(context.Background(), "example", old)
	if err != nil || len(warnings) != 5 {
		t.Fatalf("unexpected optional errors: %v, %v", err, warnings)
	}
	if p.Bio != "Current GitHub bio" || len(p.Repositories) != 1 || p.ReadmeHTML != "" {
		t.Fatalf("cache section handling: %#v", p)
	}
}

func TestGraphQLPublicPinsCalendarAndTokenNotInCache(t *testing.T) {
	c := mockClient(t, func(w http.ResponseWriter, r *http.Request) {
		publicEndpoint := r.URL.Path == "/repos/example/example/readme" || r.URL.Path == "/users/example/starred"
		if publicEndpoint && r.Header.Get("Authorization") != "" {
			t.Error("public-only endpoint must not use a privileged token")
		}
		if !publicEndpoint && r.Header.Get("Authorization") != "Bearer server-only-secret" {
			t.Errorf("server request did not use token")
		}
		switch r.URL.Path {
		case "/users/example":
			fmt.Fprint(w, `{"login":"example","email":"public@example.com"}`)
		case "/graphql":
			var request map[string]any
			if json.NewDecoder(r.Body).Decode(&request) != nil || request["variables"].(map[string]any)["login"] != "example" {
				t.Error("invalid GraphQL request")
			}
			fmt.Fprint(w, `{"data":{"user":{"pronouns":"he/him","pinnedItems":{"nodes":[{"name":"public","nameWithOwner":"example/public","url":"https://github.com/example/public","isPrivate":false,"primaryLanguage":{"name":"Go","color":"#00ADD8"}},{"name":"private","nameWithOwner":"example/private","isPrivate":true}]},"starredRepositories":{"totalCount":8},"status":{"emoji":"🌱","message":"Growing"},"contributionsCollection":{"contributionCalendar":{"totalContributions":3,"weeks":[{"contributionDays":[{"date":"2026-09-30","contributionCount":3,"contributionLevel":"THIRD_QUARTILE"}]}]}}}}}`)
		case "/repos/example/example/readme":
			w.WriteHeader(http.StatusNotFound)
		case "/users/example/starred":
			w.Header().Set("Link", `<https://api.github.com/users/example/starred?per_page=1&page=8>; rel="last"`)
			fmt.Fprint(w, `[{}]`)
		default:
			fmt.Fprint(w, `[]`)
		}
	})
	c.Token = "server-only-secret"
	cacheDir := t.TempDir()
	p, warnings, err := c.Sync(context.Background(), "example", cacheDir)
	if err != nil || len(warnings) != 0 {
		t.Fatalf("sync: %v, %v", err, warnings)
	}
	if len(p.PinnedRepositories) != 1 || p.PinnedRepositories[0].LanguageColor != "#00ADD8" {
		t.Fatalf("pins: %#v", p.PinnedRepositories)
	}
	if p.Contributions == nil || p.Contributions.Total != 3 || p.Contributions.Weeks[0].Days[0].Level != 3 {
		t.Fatalf("calendar: %#v", p.Contributions)
	}
	if p.Email != "public@example.com" || p.Pronouns != "he/him" || p.Status.Message != "Growing" || p.Stars != 8 {
		t.Fatalf("enhanced data missing")
	}
	cache, err := os.ReadFile(filepath.Join(cacheDir, "example.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(cache), c.Token) || strings.Contains(string(cache), "example/private") {
		t.Fatal("cache contains credentials or private repository")
	}
}

func TestRepositoriesFollowPagination(t *testing.T) {
	c := mockClient(t, func(w http.ResponseWriter, r *http.Request) {
		var repos []map[string]any
		count := 100
		if r.URL.Query().Get("page") == "2" {
			count = 1
		}
		for i := 0; i < count; i++ {
			repos = append(repos, map[string]any{"name": fmt.Sprintf("repo-%d", i)})
		}
		json.NewEncoder(w).Encode(repos)
	})
	repos, err := c.repositories(context.Background(), "/users/example")
	if err != nil || len(repos) != 101 {
		t.Fatalf("paginated repositories: %d, %v", len(repos), err)
	}
}
