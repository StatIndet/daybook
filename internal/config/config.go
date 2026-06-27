package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
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

type Config struct {
	Title       string           `yaml:"title"`
	BaseURL     string           `yaml:"baseURL"`
	StartedAt   string           `yaml:"startedAt"`
	Comment     CommentConfig    `yaml:"comment"`
	Attachments AttachmentConfig `yaml:"attachments"`
}

func Default() Config {
	return Config{
		Title:   "Daybook",
		BaseURL: "http://localhost:1313",
		Comment: CommentConfig{
			Enabled:  false,
			Provider: "waline",
			Waline: WalineConfig{
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
			RemoteBaseURL: "https://static.daybook.page",
			RemoteDirs:    []string{"audio", "video", "picture", "pdf"},
		},
	}
}

func Load(path string) (Config, error) {
	cfg := Default()

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("读取配置文件: %w", err)
	}

	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("解析配置文件: %w", err)
	}

	if cfg.Title == "" {
		cfg.Title = "Daybook"
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:1313"
	}

	return cfg, nil
}
