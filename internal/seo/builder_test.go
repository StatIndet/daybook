package seo_test

import (
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/seo"
)

func TestSEOBuilder(t *testing.T) {
	cfg := config.Config{
		Site: config.SiteConfig{
			Name: map[string]string{
				"zh": "中文站名",
				"en_US": "English Site",
			},
		},
	}

	argsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh_CN",
		Title:  "中文首页完整标题",
	}

	data := seo.BuildForHome(argsZH)
	if data.Title != "中文首页完整标题" {
		t.Errorf("expected Title to be '中文首页完整标题', got '%s'", data.Title)
	}
	if data.SiteName != "中文站名" {
		t.Errorf("expected SiteName to be '中文站名', got '%s'", data.SiteName)
	}

	argsEN := seo.BuilderArgs{
		Config: cfg,
		Lang:   "en_US",
		Title:  "English Full Home Title",
	}
	data = seo.BuildForHome(argsEN)
	if data.Title != "English Full Home Title" {
		t.Errorf("expected Title to be 'English Full Home Title', got '%s'", data.Title)
	}
	if data.SiteName != "English Site" {
		t.Errorf("expected SiteName to be 'English Site', got '%s'", data.SiteName)
	}

	noteArgsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh_CN",
		Title:  "测试文章",
	}
	data = seo.BuildForNote(noteArgsZH)
	if data.Title != "测试文章 | 中文站名" {
		t.Errorf("expected '测试文章 | 中文站名', got '%s'", data.Title)
	}
	if data.SiteName != "中文站名" {
		t.Errorf("expected SiteName '中文站名', got '%s'", data.SiteName)
	}

	noteArgsEN := seo.BuilderArgs{
		Config: cfg,
		Lang:   "en_US",
		Title:  "Test Note",
	}
	data = seo.BuildForNote(noteArgsEN)
	if data.Title != "Test Note | English Site" {
		t.Errorf("expected 'Test Note | English Site', got '%s'", data.Title)
	}
}
