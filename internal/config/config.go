package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Title   string `yaml:"title"`
	BaseURL string `yaml:"baseURL"`
}

func Default() Config {
	return Config{
		Title:   "Daybook",
		BaseURL: "http://localhost:1313",
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
