package config

import (
	"encoding/json"
	"os"
	"strings"
)

type ProfileConfig struct {
	Author struct {
		Name           string `json:"name"`
		NameEn         string `json:"nameEn"`
		Avatar         string `json:"avatar"`
		SignatureImage string `json:"signatureImage"`
		AboutUrl       string `json:"aboutUrl"`
	} `json:"author"`
	Slogan map[string]string `json:"slogan"`
	SEO    struct {
		HomeTitle       map[string]string `json:"homeTitle"`
		HomeDescription map[string]string `json:"homeDescription"`
	} `json:"seo"`
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
	Enabled  bool         `yaml:"enabled"`
	Provider string       `yaml:"provider"`
	Waline   WalineConfig `yaml:"waline"`
}

type AttachmentConfig struct {
	LocalDir      string   `yaml:"local_dir"`
	PublicPath    string   `yaml:"public_path"`
	RemoteBaseURL string   `yaml:"remote_base_url"`
	RemoteDirs    []string `yaml:"remote_dirs"`
}

type NeteaseConfig struct {
	Enabled    bool
	APIBaseURL string
}

type StatsConfig struct {
	Enabled bool
	APIBase string
}

type Config struct {
	Title       string           `yaml:"title"`
	BaseURL     string           `yaml:"baseURL"`
	StartedAt   string           `yaml:"startedAt"`
	Comment     CommentConfig    `yaml:"comment"`
	Attachments AttachmentConfig `yaml:"attachments"`
	Netease     NeteaseConfig
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

func Load() (Config, error) {
	cfg := Config{
		Title:     parseStringEnv("DAYBOOK_SITE_NAME", "Daybook"),
		BaseURL:   parseStringEnv("DAYBOOK_SITE_URL", "http://localhost:1313"),
		StartedAt: parseStringEnv("DAYBOOK_STARTED_AT", "2026-06-08"),
		Comment: CommentConfig{
			Enabled:  parseBoolEnv("DAYBOOK_WALINE_ENABLED"),
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
		Attachments: AttachmentConfig{
			LocalDir:      "content/attachments",
			PublicPath:    "/attachments/",
			RemoteBaseURL: parseStringEnv("DAYBOOK_R2_BASE_URL", ""),
			RemoteDirs:    []string{"audio", "video", "picture", "pdf"},
		},
		Netease: NeteaseConfig{
			Enabled:    parseBoolEnv("DAYBOOK_NETEASE_ENABLED"),
			APIBaseURL: parseStringEnv("DAYBOOK_NETEASE_API_BASE_URL", ""),
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
