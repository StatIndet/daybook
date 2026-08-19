package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

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

type SiteConfig struct {
	Title     string `yaml:"title"`
	URL       string `yaml:"url"`
	StartedAt string `yaml:"startedAt"`
}

type Config struct {
	Site    SiteConfig    `yaml:"site"`
	Profile ProfileConfig `yaml:"profile"`
	SEO     SEOConfig     `yaml:"seo"`
	Comment CommentConfig `yaml:"comment"`
	Stats   StatsConfig   `yaml:"stats"`
}

func (c Config) GetHomeTitle(lang string) string {
	return getMultilingualString(c.SEO.HomeTitle, lang)
}

func (c Config) GetHomeDescription(lang string) string {
	return getMultilingualString(c.SEO.HomeDescription, lang)
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
	if strings.TrimSpace(cfg.Site.Title) == "" {
		cfg.Site.Title = "Daybook"
	}
	if strings.TrimSpace(cfg.Site.StartedAt) == "" {
		cfg.Site.StartedAt = "2026-06-08"
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
