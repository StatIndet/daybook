package feed

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/render"
)

func TestWriteRSS(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "rss.xml")
	notes := []render.NoteLink{
		{
			Title:   "示例笔记",
			Date:    "2026-06-14",
			Slug:    "example",
			Summary: "摘要",
			URL:     "/notes/example/",
		},
	}

	err := Write(path, config.Config{Title: "Daybook", BaseURL: "https://example.com"}, notes)
	if err != nil {
		t.Fatalf("Write returned error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	html := string(data)

	wantParts := []string{
		"<rss version=\"2.0\">",
		"<title>Daybook</title>",
		"<link>https://example.com/notes/example/</link>",
		"<description>摘要</description>",
		"<pubDate>Sun, 14 Jun 2026 00:00:00 +0000</pubDate>",
	}
	for _, part := range wantParts {
		if !strings.Contains(html, part) {
			t.Fatalf("RSS does not contain %q: %s", part, html)
		}
	}
}
