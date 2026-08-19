package config

import (
	"encoding/json"
	"os"
	"strings"
)

type ProfileConfig struct {
	Author struct {
		Name     string `json:"name"`
		NameEn   string `json:"nameEn"`
		LogoText string `json:"logoText"`
		Avatar   string `json:"avatar"`
		AboutUrl string `json:"aboutUrl"`
	} `json:"author"`
	Slogan map[string]string `json:"slogan"`
	SEO    struct {
		HomeTitle       map[string]string `json:"homeTitle"`
		HomeDescription map[string]string `json:"homeDescription"`
	} `json:"seo"`
}

// HasSignatureFont reports whether the author name is "史帙",
// which is the only name that has a custom handwriting woff2 font.
func (p ProfileConfig) HasSignatureFont() bool {
	return p.Author.Name == "史帙"
}

// GetLogoText returns the persistent logo text.
// Falls back to NameEn, then Name if logoText is empty.
func (p ProfileConfig) GetLogoText() string {
	if p.Author.LogoText != "" {
		return p.Author.LogoText
	}
	if p.Author.NameEn != "" {
		return p.Author.NameEn
	}
	return p.Author.Name
}

func (p ProfileConfig) getMultilingualString(dict map[string]string, lang string) string {
	if val, ok := dict[lang]; ok && val != "" {
		return val
	}
	// Fallback to "zh" if lang is missing or empty
	if val, ok := dict["zh"]; ok && val != "" {
		return val
	}
	return ""
}

func (p ProfileConfig) GetSlogan(lang string) string {
	return p.getMultilingualString(p.Slogan, lang)
}

func (p ProfileConfig) GetHomeTitle(lang string) string {
	return p.getMultilingualString(p.SEO.HomeTitle, lang)
}

func (p ProfileConfig) GetHomeDescription(lang string) string {
	return p.getMultilingualString(p.SEO.HomeDescription, lang)
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
	Provider string       `yaml:"provider"`
	Waline   WalineConfig `yaml:"waline"`
}

type StatsConfig struct {
	Enabled bool
	APIBase string
}

type Config struct {
	Title       string        `yaml:"title"`
	BaseURL     string        `yaml:"baseURL"`
	StartedAt   string        `yaml:"startedAt"`
	Comment     CommentConfig `yaml:"comment"`
	Stats       StatsConfig
	Profile     ProfileConfig
}

func parseStringEnv(key, fallback string) string {
	val, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	val = strings.TrimSpace(val)
	val = strings.Trim(val, `"'`)
	if val == "" {
		return fallback
	}
	return val
}

func parseBoolEnv(key string) bool {
	val := strings.TrimSpace(os.Getenv(key))
	val = strings.Trim(val, `"'`)
	val = strings.ToLower(val)
	return val == "true" || val == "1" || val == "on" || val == "yes"
}

func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			// Only set if not already present in environment
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, val)
			}
		}
	}
}

func Load() (Config, error) {
	loadDotEnv()

	cfg := Config{
		Title:     parseStringEnv("DAYBOOK_SITE_NAME", "Daybook"),
		BaseURL:   parseStringEnv("DAYBOOK_SITE_URL", "http://localhost:1313"),
		StartedAt: parseStringEnv("DAYBOOK_STARTED_AT", "2026-06-08"),
		Comment: CommentConfig{
			Provider: "waline",
			Waline: WalineConfig{
				ServerURL:      parseStringEnv("DAYBOOK_WALINE_SERVER_URL", ""),
				Lang:           "zh-CN",
				PageSize:       10,
				CommentSorting: "latest",
				Search:         false,
				ImageUploader:  false,
			},
		},

		Stats: StatsConfig{
			Enabled: parseBoolEnv("DAYBOOK_STATS_ENABLED"),
			APIBase: parseStringEnv("DAYBOOK_STATS_API_BASE", "/api"),
		},
	}

	profileData, err := os.ReadFile("data/profile.json")
	if err == nil {
		_ = json.Unmarshal(profileData, &cfg.Profile)
	} else {
		// Provide default fallbacks if missing
		cfg.Profile.Author.Name = "史帙"
		cfg.Profile.Author.NameEn = "Daybook"
		cfg.Profile.Author.Avatar = "/images/avatar/shelby.jpg"
		cfg.Profile.Author.AboutUrl = "/about/"
	}

	return cfg, nil
}
