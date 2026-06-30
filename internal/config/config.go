package config

import (
	"os"
)

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
}

func getEnvOrDefault(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}

func Load() (Config, error) {
	cfg := Config{
		Title:     getEnvOrDefault("DAYBOOK_SITE_NAME", "Daybook"),
		BaseURL:   getEnvOrDefault("DAYBOOK_SITE_URL", "http://localhost:1313"),
		StartedAt: getEnvOrDefault("DAYBOOK_STARTED_AT", "2026-06-08"),
		Comment: CommentConfig{
			Enabled:  os.Getenv("DAYBOOK_WALINE_ENABLED") == "true",
			Provider: "waline",
			Waline: WalineConfig{
				ServerURL:      os.Getenv("DAYBOOK_WALINE_SERVER_URL"),
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
			RemoteBaseURL: os.Getenv("DAYBOOK_R2_BASE_URL"),
			RemoteDirs:    []string{"audio", "video", "picture", "pdf"},
		},
		Netease: NeteaseConfig{
			Enabled:    os.Getenv("DAYBOOK_NETEASE_ENABLED") == "true",
			APIBaseURL: os.Getenv("DAYBOOK_NETEASE_API_BASE_URL"),
		},
		Stats: StatsConfig{
			Enabled: os.Getenv("DAYBOOK_STATS_ENABLED") == "true",
			APIBase: getEnvOrDefault("DAYBOOK_STATS_API_BASE", "/api"),
		},
	}

	return cfg, nil
}
