package config

import (
	"fmt"
	"os"
	"regexp"
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
}

type ProfileConfig struct {
	Author       AuthorConfig       `yaml:"author"`
	Slogan       map[string]string  `yaml:"slogan"`
	Social       []SocialLinkConfig `yaml:"social"`
	ParsedSocial []SocialLink       `yaml:"-"`
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
	if p.Author.Name != "" {
		return p.Author.Name
	}
	return "Daybook"
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

type GiscusConfig struct {
	Repo       string `yaml:"repo"`
	RepoID     string `yaml:"repoId"`
	Category   string `yaml:"category"`
	CategoryID string `yaml:"categoryId"`
}

type CommentConfig struct {
	Enabled  bool         `yaml:"enabled"`
	Provider string       `yaml:"provider"`
	Giscus   GiscusConfig `yaml:"giscus"`
}

// Available also protects callers that construct Config directly instead of
// loading daybook.yaml. A note may opt out, but cannot bypass this global gate.
func (c CommentConfig) Available() bool {
	return c.Enabled && c.Provider == "giscus" &&
		strings.TrimSpace(c.Giscus.Repo) != "" &&
		strings.TrimSpace(c.Giscus.RepoID) != "" &&
		strings.TrimSpace(c.Giscus.Category) != "" &&
		strings.TrimSpace(c.Giscus.CategoryID) != ""
}

type StatsConfig struct {
	Enabled bool `yaml:"enabled"`
}

type ShareConfig struct {
	Text string `yaml:"text"`
}

// SearchProperties explicitly opts custom note properties into the public
// graph search index. All other frontmatter remains build-time data only.
type GraphConfig struct {
	SearchProperties []string `yaml:"searchProperties"`
}

// GitHubConfig selects the public profile used by the homepage. Credentials are
// read from the environment at build time and are never included in output.
type GitHubConfig struct {
	Username string `yaml:"username"`
	TokenEnv string `yaml:"tokenEnv"`
}

type SiteConfig struct {
	URL       string `yaml:"url"`
	StartedAt string `yaml:"startedAt"`
	Favicon   string `yaml:"favicon"`
	Copyright string `yaml:"copyright"`
}

type Config struct {
	Site    SiteConfig    `yaml:"site"`
	Profile ProfileConfig `yaml:"profile"`
	SEO     SEOConfig     `yaml:"seo"`
	Comment CommentConfig `yaml:"comment"`
	Stats   StatsConfig   `yaml:"stats"`
	Share   ShareConfig   `yaml:"share"`
	GitHub  GitHubConfig  `yaml:"github"`
	Graph   GraphConfig   `yaml:"graph"`
}

func (c Config) GetSiteName(_ string) string {
	return c.Profile.GetLogoText()
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
	if lang != "zh_CN" && lang != "zh" {
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

func parseSocialLinks(configs []SocialLinkConfig) []SocialLink {
	var links []SocialLink
	for _, c := range configs {
		if strings.TrimSpace(c.URL) == "" {
			continue
		}
		if c.Type == "rss" {
			continue
		}

		link := (Config{}).ResolveSocialLink(c.URL, c.Type)
		if link.URL != "" {
			links = append(links, link)
		}
	}
	return links
}

func Load() (Config, error) {
	return LoadWithWarnings(func(message string) { fmt.Println("WARN  " + message) })
}

// LoadWithWarnings lets the CLI coordinate configuration warnings with build output.
func LoadWithWarnings(warn func(string)) (Config, error) {
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
	properties := make([]string, 0, len(cfg.Graph.SearchProperties))
	seenProperties := make(map[string]bool)
	for _, property := range cfg.Graph.SearchProperties {
		property = strings.TrimSpace(property)
		if property != "" && !seenProperties[property] {
			properties = append(properties, property)
			seenProperties[property] = true
		}
	}
	cfg.Graph.SearchProperties = properties

	cfg.Comment.Provider = strings.TrimSpace(cfg.Comment.Provider)
	cfg.Comment.Giscus.Repo = strings.TrimSpace(cfg.Comment.Giscus.Repo)
	cfg.Comment.Giscus.RepoID = strings.TrimSpace(cfg.Comment.Giscus.RepoID)
	cfg.Comment.Giscus.Category = strings.TrimSpace(cfg.Comment.Giscus.Category)
	cfg.Comment.Giscus.CategoryID = strings.TrimSpace(cfg.Comment.Giscus.CategoryID)
	if cfg.Comment.Enabled && !cfg.Comment.Available() {
		if cfg.Comment.Provider != "giscus" {
			if warn != nil {
				warn(fmt.Sprintf("unsupported comment provider %q; use giscus, disabling comments", cfg.Comment.Provider))
			}
		} else {
			if warn != nil {
				warn("giscus requires repo, repoId, category and categoryId, disabling comments")
			}
		}
		cfg.Comment.Enabled = false
	}

	if cfg.Site.URL != "" && !strings.HasPrefix(cfg.Site.URL, "http://") && !strings.HasPrefix(cfg.Site.URL, "https://") {
		return Config{}, fmt.Errorf("config error: site.url must be a valid http/https URL")
	}

	cfg.GitHub.Username = strings.TrimSpace(cfg.GitHub.Username)
	if cfg.GitHub.Username != "" && !regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`).MatchString(cfg.GitHub.Username) {
		return Config{}, fmt.Errorf("config error: github.username must be a GitHub username")
	}
	if cfg.GitHub.TokenEnv == "" {
		cfg.GitHub.TokenEnv = "GITHUB_TOKEN"
	}

	return cfg, nil
}
