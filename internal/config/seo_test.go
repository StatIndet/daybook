package config_test

import (
	"testing"

	"github.com/StatIndet/daybook/internal/config"
)

func TestGetSiteName(t *testing.T) {
	cfg := config.Config{
		Profile: config.ProfileConfig{Author: config.AuthorConfig{LogoText: "My Blog"}},
	}

	if name := cfg.GetSiteName("zh_CN"); name != "My Blog" {
		t.Errorf("expected 'My Blog', got '%s'", name)
	}

	if name := cfg.GetSiteName("en_US"); name != "My Blog" {
		t.Errorf("expected 'My Blog', got '%s'", name)
	}

	cfgEmpty := config.Config{}
	if name := cfgEmpty.GetSiteName("zh_CN"); name != "Daybook" {
		t.Errorf("expected 'Daybook', got '%s'", name)
	}
}
