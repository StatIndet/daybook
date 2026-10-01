package site

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/github"
	"github.com/StatIndet/daybook/internal/render"
	"github.com/StatIndet/daybook/internal/seo"
)

func TestGitHubProfileOverridesLegacyHomeMetadata(t *testing.T) {
	cfg := config.Config{Site: config.SiteConfig{URL: "https://example.com"}, Profile: config.ProfileConfig{Author: config.AuthorConfig{Name: "Old name", Avatar: "/old.jpg", LogoText: "Daybook", AboutUrl: "/about/"}}, SEO: config.SEOConfig{HomeDescription: map[string]string{"zh_CN": "Old description"}}}
	p := &github.Profile{Login: "octocat", Name: "New name", Bio: "Bio from GitHub", HTMLURL: "https://github.com/octocat", AvatarURL: "https://avatars.githubusercontent.com/u/1"}
	applyGitHubProfile(&cfg, p)
	if cfg.Profile.Author.Name != p.Name || cfg.Profile.Author.NameEn != p.Login || cfg.GetHomeDescription("en_US") != p.Bio {
		t.Fatalf("legacy profile was not replaced: %#v", cfg)
	}
	if cfg.Profile.Author.LogoText != "Daybook" || cfg.Profile.Author.AboutUrl != "/about/" {
		t.Fatal("persistent logo and local avatar transition route must survive")
	}
	data := seo.BuildForHome(seo.BuilderArgs{Config: cfg, GitHub: p, Lang: "zh_CN", Title: cfg.GetHomeTitle("zh_CN"), Description: cfg.GetHomeDescription("zh_CN"), PageURL: "/"})
	if data.Description != p.Bio || data.AuthorURL != p.HTMLURL || !strings.Contains(string(data.JSONLD), p.Bio) || !strings.Contains(data.Image, "s=520") {
		t.Fatalf("GitHub SEO missing: %#v", data)
	}
}

func TestHomeRendersGitHubSnapshot(t *testing.T) {
	cfg := config.Config{Site: config.SiteConfig{URL: "https://example.com"}, Profile: config.ProfileConfig{Author: config.AuthorConfig{LogoText: "Daybook", AboutUrl: "/about/"}}}
	p := &github.Profile{Login: "octocat", Name: "GitHub Name", Bio: "An upstream bio <with markup>", HTMLURL: "https://github.com/octocat", AvatarURL: "https://avatars.githubusercontent.com/u/1", CreatedAt: "2020-01-02T00:00:00Z", FetchedAt: "2026-09-30T00:00:00Z", Repositories: []github.Repository{{Name: "public-project", HTMLURL: "https://github.com/octocat/public-project", Description: "Public repository", Language: "Go", Stars: 3}}, Events: []github.Event{{Type: "PushEvent", CreatedAt: "2026-09-29T00:00:00Z", URL: "https://github.com/octocat/public-project", Summary: "Pushed to main"}}}
	applyGitHubProfile(&cfg, p)
	output := filepath.Join(t.TempDir(), "index.html")
	data := render.IndexData{Config: cfg, GitHub: p, Lang: "zh_CN", PageKind: "home", BodyClass: "home-body", AlternateURL: "/en_US/", SEO: seo.BuildForHome(seo.BuilderArgs{Config: cfg, GitHub: p, Lang: "zh_CN", Title: cfg.GetHomeTitle("zh_CN"), Description: cfg.GetHomeDescription("zh_CN"), PageURL: "/"})}
	if err := render.New("templates").RenderIndex(output, data); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	html := string(body)
	for _, want := range []string{"data-github-home", "GitHub Name", "public-project", "An upstream bio &lt;with markup&gt;", `fetchpriority="high"`, "s=520", "Pushed to main"} {
		if !strings.Contains(html, want) {
			t.Errorf("homepage missing %q", want)
		}
	}
}
