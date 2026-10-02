package config

import (
	"net/url"
	"strings"
)

type socialPlatform struct {
	Label   string
	Icon    string
	Domains []string
}

var supportedSocialPlatforms = map[string]socialPlatform{
	"afdian":       {"AFDIAN", "/icons/social/afdian.svg", []string{"afdian.com", "afdian.net", "ifdian.net", "ifdian.com"}},
	"bilibili":     {"Bilibili", "/icons/social/bilibili.svg", []string{"bilibili.com", "b23.tv"}},
	"bluesky":      {"Bluesky", "/icons/social/bluesky.svg", []string{"bsky.app"}},
	"buymeacoffee": {"Buy Me a Coffee", "/icons/social/buymeacoffee.svg", []string{"buymeacoffee.com"}},
	"discord":      {"Discord", "/icons/social/discord.svg", []string{"discord.com", "discord.gg"}},
	"email":        {"Email", "/icons/social/gmail.svg", nil},
	"github":       {"GitHub", "/icons/social/github.svg", []string{"github.com"}},
	"gitlab":       {"GitLab", "/icons/social/gitlab.svg", []string{"gitlab.com"}},
	"instagram":    {"Instagram", "/icons/social/instagram.svg", []string{"instagram.com"}},
	"kofi":         {"Ko-fi", "/icons/social/kofi.svg", []string{"ko-fi.com"}},
	"mastodon":     {"Mastodon", "/icons/social/mastodon.svg", []string{"mastodon.social", "mastodon.online"}},
	"qq":           {"QQ", "/icons/social/qq.svg", []string{"qq.com"}},
	"reddit":       {"Reddit", "/icons/social/reddit.svg", []string{"reddit.com", "redd.it"}},
	"telegram":     {"Telegram", "/icons/social/telegram.svg", []string{"t.me", "telegram.me", "telegram.org"}},
	"threads":      {"Threads", "/icons/social/threads.svg", []string{"threads.net", "threads.com"}},
	"twitch":       {"Twitch", "/icons/social/twitch.svg", []string{"twitch.tv"}},
	"x":            {"X (Twitter)", "/icons/social/x.svg", []string{"x.com", "twitter.com"}},
	"youtube":      {"YouTube", "/icons/social/youtube.svg", []string{"youtube.com", "youtu.be"}},
}

func socialType(provider string) string {
	switch provider = strings.ToLower(strings.TrimSpace(provider)); provider {
	case "twitter":
		return "x"
	case "ko-fi", "ko_fi":
		return "kofi"
	case "buy-me-a-coffee", "buy_me_a_coffee":
		return "buymeacoffee"
	case "ifdian", "aifadian":
		return "afdian"
	case "gmail":
		return "email"
	default:
		return provider
	}
}

func socialHost(u *url.URL) string {
	return strings.TrimPrefix(strings.TrimSuffix(strings.ToLower(u.Hostname()), "."), "www.")
}

// ResolveSocialLink uses the destination before the provider: GitHub labels
// many supported services as "generic". Only known brands get local icons.
func (c Config) ResolveSocialLink(rawURL, provider string) SocialLink {
	rawURL = strings.TrimSpace(rawURL)
	link := SocialLink{Type: "website", Label: "Website", URL: rawURL}
	if rawURL == "" {
		return link
	}
	if strings.HasPrefix(rawURL, "//") {
		rawURL = "https:" + rawURL
	} else if !strings.Contains(rawURL, ":") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http" && u.Scheme != "mailto") {
		link.URL = ""
		return link
	}
	link.URL = u.String()
	kind := socialType(provider)
	if u.Scheme == "mailto" {
		kind = "email"
	} else {
		host := socialHost(u)
		if host == "" {
			link.URL = ""
			return link
		}
		if site, err := url.Parse(c.Site.URL); err == nil && socialHost(site) != "" && host == socialHost(site) {
			link.Type, link.Label, link.Icon = "website", c.GetSiteName("en_US"), "/favicon.svg"
			if c.Site.Favicon != "" {
				link.Icon = "/" + strings.TrimPrefix(c.Site.Favicon, "/")
			}
			return link
		}
		for candidate, platform := range supportedSocialPlatforms {
			for _, domain := range platform.Domains {
				if host == domain || strings.HasSuffix(host, "."+domain) {
					kind = candidate
				}
			}
		}
	}
	if platform, ok := supportedSocialPlatforms[kind]; ok {
		link.Type, link.Label, link.Icon = kind, platform.Label, platform.Icon
	}
	return link
}
