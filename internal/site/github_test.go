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
	cfg := config.Config{Site: config.SiteConfig{URL: "https://example.com"}, Profile: config.ProfileConfig{Author: config.AuthorConfig{Name: "Old name", Avatar: "/old.jpg", LogoText: "Daybook"}}, SEO: config.SEOConfig{HomeDescription: map[string]string{"zh_CN": "Old description"}}}
	p := &github.Profile{Login: "octocat", Name: "New name", Bio: "Bio from GitHub", HTMLURL: "https://github.com/octocat", AvatarURL: "https://avatars.githubusercontent.com/u/1"}
	applyGitHubProfile(&cfg, p)
	if cfg.Profile.Author.Name != p.Name || cfg.Profile.Author.NameEn != p.Login || cfg.GetHomeDescription("en_US") != p.Bio {
		t.Fatalf("legacy profile was not replaced: %#v", cfg)
	}
	if cfg.Profile.Author.LogoText != "Daybook" {
		t.Fatal("persistent logo must survive")
	}
	data := seo.BuildForHome(seo.BuilderArgs{Config: cfg, GitHub: p, Lang: "zh_CN", Title: cfg.GetHomeTitle("zh_CN"), Description: cfg.GetHomeDescription("zh_CN"), PageURL: "/"})
	if data.Description != p.Bio || data.AuthorURL != p.HTMLURL || !strings.Contains(string(data.JSONLD), p.Bio) || !strings.Contains(data.Image, "s=520") {
		t.Fatalf("GitHub SEO missing: %#v", data)
	}
}

func TestHomeRendersGitHubSnapshot(t *testing.T) {
	cfg := config.Config{Site: config.SiteConfig{URL: "https://example.com"}, Profile: config.ProfileConfig{Author: config.AuthorConfig{LogoText: "Daybook"}}}
	p := &github.Profile{Login: "octocat", Name: "GitHub Name", Pronouns: "he/him", Email: "public@example.com", Bio: "An upstream bio <with markup>", HTMLURL: "https://github.com/octocat", AvatarURL: "https://avatars.githubusercontent.com/u/1", CreatedAt: "2020-01-02T00:00:00Z", FetchedAt: "2026-09-30T00:00:00Z", ReadmeHTML: "<p>README body</p>", PinnedRepositories: []github.Repository{{Name: "pinned-project", HTMLURL: "https://github.com/octocat/pinned-project"}}, Repositories: []github.Repository{{Name: "public-project", HTMLURL: "https://github.com/octocat/public-project", Description: "Public repository", Language: "Go", Stars: 3}}, Events: []github.Event{{Type: "PushEvent", CreatedAt: "2026-09-29T00:00:00Z", URL: "https://github.com/octocat/public-project", Summary: "Pushed to main"}}}
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
	for _, want := range []string{"data-github-home", "GitHub Name", "he/him", "mailto:public@example.com", "pinned-project", "README body", "An upstream bio &lt;with markup&gt;", `fetchpriority="high"`, "s=520"} {
		if !strings.Contains(html, want) {
			t.Errorf("homepage missing %q", want)
		}
	}
	for _, removed := range []string{"github-profile-link", "github-gists", "github-tabs", "github-readme-heading", "github-activity", "public-project", "Pushed to main"} {
		if strings.Contains(html, removed) {
			t.Errorf("homepage still renders removed section %q", removed)
		}
	}
}

func TestGitHubContactsUseLocalBrandIconsAndReadableFooterLabels(t *testing.T) {
	cfg := config.Config{Site: config.SiteConfig{URL: "https://daybook.page"}}
	p := &github.Profile{Login: "example", HTMLURL: "https://github.com/example", AvatarURL: "https://avatars.githubusercontent.com/u/1", Blog: "https://daybook.page", SocialAccounts: []github.SocialAccount{
		{Provider: "generic", URL: "https://space.bilibili.com/1"},
		{Provider: "generic", URL: "https://ko-fi.com/example"},
		{Provider: "generic", URL: "https://ifdian.net/a/example"},
		{Provider: "generic", URL: "https://buymeacoffee.com/example"},
		{Provider: "generic", URL: "https://unknown.example"},
	}}
	applyGitHubProfile(&cfg, p)
	for index, want := range []string{"GitHub", "Bilibili", "Ko-fi", "AFDIAN", "Buy Me a Coffee", "Website"} {
		if cfg.Profile.ParsedSocial[index].Label != want {
			t.Fatalf("wrong footer label: %+v", cfg.Profile.ParsedSocial[index])
		}
	}
	output := filepath.Join(t.TempDir(), "index.html")
	if err := render.New("templates").RenderIndex(output, render.IndexData{Config: cfg, GitHub: p, Lang: "zh_CN", PageKind: "home"}); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"/favicon.svg", "/icons/social/bilibili.svg", "/icons/social/kofi.svg", "/icons/social/afdian.svg", "/icons/social/buymeacoffee.svg", `class="material-symbol" aria-hidden="true">link</span><span>https://unknown.example`} {
		if !strings.Contains(string(body), want) {
			t.Errorf("missing contact identity %q", want)
		}
	}
	if strings.Contains(string(body), "notes-footer-links") || strings.Contains(string(body), "drawer-footer-row") || strings.Contains(string(body), "ZgotmplZ") || strings.Contains(string(body), ">generic</a>") {
		t.Fatal("social icon or label did not survive template escaping")
	}
}
