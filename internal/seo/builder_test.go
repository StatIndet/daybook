package seo_test

import (
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/seo"
)

func TestSEOBuilder(t *testing.T) {
	cfg := config.Config{
		Profile: config.ProfileConfig{Author: config.AuthorConfig{LogoText: "My Blog"}},
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
	if data.SiteName != "My Blog" {
		t.Errorf("expected SiteName to be 'My Blog', got '%s'", data.SiteName)
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
	if data.SiteName != "My Blog" {
		t.Errorf("expected SiteName to be 'My Blog', got '%s'", data.SiteName)
	}

	noteArgsZH := seo.BuilderArgs{
		Config: cfg,
		Lang:   "zh_CN",
		Title:  "测试文章",
	}
	data = seo.BuildForNote(noteArgsZH)
	if data.Title != "测试文章 | My Blog" {
		t.Errorf("expected '测试文章 | My Blog', got '%s'", data.Title)
	}
	if data.SiteName != "My Blog" {
		t.Errorf("expected SiteName 'My Blog', got '%s'", data.SiteName)
	}

	noteArgsEN := seo.BuilderArgs{
		Config: cfg,
		Lang:   "en_US",
		Title:  "Test Note",
	}
	data = seo.BuildForNote(noteArgsEN)
	if data.Title != "Test Note | My Blog" {
		t.Errorf("expected 'Test Note | My Blog', got '%s'", data.Title)
	}
}
