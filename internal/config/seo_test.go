package config_test

import (
	"testing"

	"github.com/StatIndet/daybook/internal/config"
)

func TestGetSiteName(t *testing.T) {
	cfg := config.Config{
		Site: config.SiteConfig{
			Title: "Daybook Fallback",
		},
		SEO: config.SEOConfig{
			SiteName: map[string]string{
				"zh": "中文站名",
				"en": "English Site",
			},
		},
	}

	if name := cfg.GetSiteName("zh-CN"); name != "中文站名" {
		t.Errorf("expected '中文站名', got '%s'", name)
	}

	if name := cfg.GetSiteName("en"); name != "English Site" {
		t.Errorf("expected 'English Site', got '%s'", name)
	}

	cfgEmpty := config.Config{
		Site: config.SiteConfig{
			Title: "My Fallback Title",
		},
	}
	if name := cfgEmpty.GetSiteName("zh-CN"); name != "My Fallback Title" {
		t.Errorf("expected 'My Fallback Title', got '%s'", name)
	}
}
