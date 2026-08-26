package seo_test

import (
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/seo"
)

func TestSEOBuilder(t *testing.T) {
	cfg := config.Config{
		Site: config.SiteConfig{
			Title: "Fallback Site",
		},
		SEO: config.SEOConfig{
			SiteName: map[string]string{
				"zh": "中文站名",
				"en": "English Site",
			},
		},
	}

	argsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh-CN",
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
		Lang:   "en",
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
		Lang:   "zh-CN",
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
		Lang:   "en",
		Title:  "Test Note",
	}
	data = seo.BuildForNote(noteArgsEN)
	if data.Title != "Test Note | English Site" {
		t.Errorf("expected 'Test Note | English Site', got '%s'", data.Title)
	}

	colArgsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh-CN",
		Title:  "笔记",
	}
	data = seo.BuildForCollection(colArgsZH)
	if data.Title != "笔记 | 中文站名" {
		t.Errorf("expected '笔记 | 中文站名', got '%s'", data.Title)
	}

	arcArgsEN := seo.BuilderArgs{
		Config: cfg,
		Lang:   "en",
		Title:  "Archive",
	}
	data = seo.BuildForCollection(arcArgsEN)
	if data.Title != "Archive | English Site" {
		t.Errorf("expected 'Archive | English Site', got '%s'", data.Title)
	}

	aboutArgsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh-CN",
		Title:  "关于",
	}
	data = seo.BuildForAbout(aboutArgsZH)
	if data.Title != "关于 | 中文站名" {
		t.Errorf("expected '关于 | 中文站名', got '%s'", data.Title)
	}

	tagArgsEN := seo.BuilderArgs{
		Config: cfg,
		Lang:   "en",
		Title:  "Linux",
	}
	data = seo.BuildForTag(tagArgsEN)
	if data.Title != "Linux | English Site" {
		t.Errorf("expected 'Linux | English Site', got '%s'", data.Title)
	}
}
