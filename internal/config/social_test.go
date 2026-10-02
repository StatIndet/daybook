package config

import (
	"github.com/StatIndet/daybook/internal/embedded"
	"strings"
	"testing"
)

func TestResolveSocialLinkByDestination(t *testing.T) {
	cfg := Config{Site: SiteConfig{URL: "https://daybook.page"}}
	for _, tc := range []struct{ url, provider, kind, label, icon string }{
		{"https://space.bilibili.com/123", "generic", "bilibili", "Bilibili", "/icons/social/bilibili.svg"},
		{"https://ko-fi.com/author", "generic", "kofi", "Ko-fi", "/icons/social/kofi.svg"},
		{"https://buymeacoffee.com/author", "generic", "buymeacoffee", "Buy Me a Coffee", "/icons/social/buymeacoffee.svg"},
		{"https://ifdian.net/a/author", "generic", "afdian", "AFDIAN", "/icons/social/afdian.svg"},
		{"https://afdian.com/a/author", "generic", "afdian", "AFDIAN", "/icons/social/afdian.svg"},
		{"https://twitter.com/author", "generic", "x", "X (Twitter)", "/icons/social/x.svg"},
		{"https://social.example/@author", "mastodon", "mastodon", "Mastodon", "/icons/social/mastodon.svg"},
		{"https://www.daybook.page/about/", "generic", "website", "Daybook", "/favicon.svg"},
		{"https://unknown.example/profile", "generic", "website", "Website", ""},
		{"https://ko-fi.com.evil.example/profile", "generic", "website", "Website", ""},
		{"https://ko-fi.com@evil.example/profile", "generic", "website", "Website", ""},
		{"mailto:author@example.com", "generic", "email", "Email", "/icons/social/gmail.svg"},
		{"//ko-fi.com/author", "generic", "kofi", "Ko-fi", "/icons/social/kofi.svg"},
	} {
		t.Run(tc.url, func(t *testing.T) {
			link := cfg.ResolveSocialLink(tc.url, tc.provider)
			if link.Type != tc.kind || link.Label != tc.label || link.Icon != tc.icon || link.URL == "" {
				t.Fatalf("wrong social identity: %+v", link)
			}
		})
	}
	cfg.Site.Favicon = "attachments/custom.svg"
	if got := cfg.ResolveSocialLink("https://daybook.page", "").Icon; got != "/attachments/custom.svg" {
		t.Fatalf("custom site favicon ignored: %q", got)
	}
}

func TestUnknownConfiguredSocialLinkKeepsReadableFallback(t *testing.T) {
	links := parseSocialLinks([]SocialLinkConfig{{Type: "generic", URL: "https://unknown.example"}, {Type: "generic", URL: "https://ko-fi.com/author"}})
	if len(links) != 2 || links[0].Label != "Website" || links[1].Label != "Ko-fi" {
		t.Fatalf("unknown providers must not hide valid links or leak generic labels: %+v", links)
	}
}

func TestSocialPlatformIconsAreSelfHosted(t *testing.T) {
	for name, platform := range supportedSocialPlatforms {
		if _, err := embedded.FS.ReadFile("static/" + strings.TrimPrefix(platform.Icon, "/")); err != nil {
			t.Errorf("%s has no embedded icon: %v", name, err)
		}
	}
}
