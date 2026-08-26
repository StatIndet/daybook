package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type SocialLinkConfig struct {
	Type string `yaml:"type"`
	URL  string `yaml:"url"`
}

type SocialLink struct {
	Type  string
	Label string
	URL   string
	Icon  string
}

type AuthorConfig struct {
	Name     string `yaml:"name"`
	NameEn   string `yaml:"nameEn"`
	LogoText string `yaml:"logoText"`
	Avatar   string `yaml:"avatar"`
	AboutUrl string `yaml:"aboutUrl"`
}

type ProfileConfig struct {
	Author AuthorConfig      `yaml:"author"`
	Slogan map[string]string `yaml:"slogan"`
	Social []SocialLinkConfig `yaml:"social"`
	ParsedSocial []SocialLink `yaml:"-"`
}

func (p ProfileConfig) HasSignatureFont() bool {
	return p.Author.Name == "史帙"
}

func (p ProfileConfig) GetLogoText() string {
	if p.Author.LogoText != "" {
		return p.Author.LogoText
	}
	if p.Author.NameEn != "" {
		return p.Author.NameEn
	}
	return p.Author.Name
}

func getMultilingualString(dict map[string]string, lang string) string {
	if val, ok := dict[lang]; ok && val != "" {
		return val
	}
	if val, ok := dict["zh"]; ok && val != "" {
		return val
	}
	return ""
}

func (p ProfileConfig) GetSlogan(lang string) string {
	return getMultilingualString(p.Slogan, lang)
}

type SEOConfig struct {
	HomeTitle       map[string]string `yaml:"homeTitle"`
	HomeDescription map[string]string `yaml:"homeDescription"`
}

type WalineConfig struct {
	ServerURL      string `yaml:"serverURL"`
	Lang           string `yaml:"lang"`
	PageSize       int    `yaml:"pageSize"`
	CommentSorting string `yaml:"commentSorting"`
	Search         bool   `yaml:"search"`
	ImageUploader  bool   `yaml:"imageUploader"`
}

type CommentConfig struct {
	Enabled  bool         `yaml:"enabled"`
	Provider string       `yaml:"provider"`
	Waline   WalineConfig `yaml:"waline"`
}

type StatsConfig struct {
	Enabled bool `yaml:"enabled"`
}

type ShareConfig struct {
	Text string `yaml:"text"`
}

type SiteConfig struct {
	Name      map[string]string `yaml:"name"`
	URL       string            `yaml:"url"`
	StartedAt string            `yaml:"startedAt"`
	Favicon   string            `yaml:"favicon"`
	Copyright string            `yaml:"copyright"`
}

type Config struct {
	Site    SiteConfig    `yaml:"site"`
	Profile ProfileConfig `yaml:"profile"`
	SEO     SEOConfig     `yaml:"seo"`
	Comment CommentConfig `yaml:"comment"`
	Stats   StatsConfig   `yaml:"stats"`
	Share   ShareConfig   `yaml:"share"`
}

func (c Config) GetSiteName(lang string) string {
	if val := getMultilingualString(c.Site.Name, lang); val != "" {
		return val
	}
	return "Daybook"
}

func (c Config) GetHomeTitle(lang string) string {
	return getMultilingualString(c.SEO.HomeTitle, lang)
}

func (c Config) GetHomeDescription(lang string) string {
	return getMultilingualString(c.SEO.HomeDescription, lang)
}

func (c Config) GetSocialLinks(lang string) []SocialLink {
	links := make([]SocialLink, len(c.Profile.ParsedSocial))
	copy(links, c.Profile.ParsedSocial)
	
	rssURL := "/rss.xml"
	if lang != "zh-CN" && lang != "zh" {
		rssURL = "/" + lang + "/rss.xml"
	}
	
	links = append(links, SocialLink{
		Type:  "rss",
		Label: "RSS",
		URL:   rssURL,
		Icon:  "/icons/social/rss.svg",
	})
	
	return links
}


var supportedSocialPlatforms = map[string]struct{ Label, Icon string }{
	"bilibili":  {"Bilibili", "/icons/social/bilibili.svg"},
	"bluesky":   {"Bluesky", "/icons/social/bluesky.svg"},
	"discord":   {"Discord", "/icons/social/discord.svg"},
	"email":     {"Email", "/icons/social/gmail.svg"},
	"github":    {"GitHub", "/icons/social/github.svg"},
	"gitlab":    {"GitLab", "/icons/social/gitlab.svg"},
	"instagram": {"Instagram", "/icons/social/instagram.svg"},
	"mastodon":  {"Mastodon", "/icons/social/mastodon.svg"},
	"qq":        {"QQ", "/icons/social/qq.svg"},
	"reddit":    {"Reddit", "/icons/social/reddit.svg"},
	"telegram":  {"Telegram", "/icons/social/telegram.svg"},
	"threads":   {"Threads", "/icons/social/threads.svg"},
	"twitch":    {"Twitch", "/icons/social/twitch.svg"},
	"x":         {"X (Twitter)", "/icons/social/x.svg"},
	"youtube":   {"YouTube", "/icons/social/youtube.svg"},
}

func parseSocialLinks(configs []SocialLinkConfig) []SocialLink {
	var links []SocialLink
	for _, c := range configs {
		if strings.TrimSpace(c.URL) == "" {
			continue
		}
		if c.Type == "rss" {
			continue
		}
		
		info, ok := supportedSocialPlatforms[c.Type]
		if !ok {
			fmt.Printf("[daybook] warning: unsupported social platform \"%s\", skipping\n", c.Type)
			continue
		}
		
		links = append(links, SocialLink{
			Type:  c.Type,
			Label: info.Label,
			URL:   c.URL,
			Icon:  info.Icon,
		})
	}
	return links
}

func Load() (Config, error) {
	data, err := os.ReadFile("daybook.yaml")
	if err != nil {
		return Config{}, fmt.Errorf("config error: daybook.yaml not found: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("config error: invalid daybook.yaml: %w", err)
	}

	// Defaults and Fallbacks
  cfg.Profile.ParsedSocial = parseSocialLinks(cfg.Profile.Social)
	if strings.TrimSpace(cfg.Site.StartedAt) == "" {
		cfg.Site.StartedAt = "2026-06-08"
	}
	if cfg.Share.Text == "" {
		cfg.Share.Text = `"{Title}"`
	}

	if cfg.Comment.Enabled {
		if cfg.Comment.Provider == "waline" {
			if cfg.Comment.Waline.ServerURL == "" {
				fmt.Println("[daybook] warning: comment provider is waline but serverURL is empty, disabling comments.")
				cfg.Comment.Enabled = false
			}
			if cfg.Comment.Waline.PageSize == 0 {
				cfg.Comment.Waline.PageSize = 10
			}
			if cfg.Comment.Waline.Lang == "" {
				cfg.Comment.Waline.Lang = "zh-CN"
			}
			if cfg.Comment.Waline.CommentSorting == "" {
				cfg.Comment.Waline.CommentSorting = "latest"
			}
		}
	}

	if cfg.Site.URL != "" && !strings.HasPrefix(cfg.Site.URL, "http://") && !strings.HasPrefix(cfg.Site.URL, "https://") {
		return Config{}, fmt.Errorf("config error: site.url must be a valid http/https URL")
	}

	return cfg, nil
}
