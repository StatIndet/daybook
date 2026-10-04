package site

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/graph"
	"github.com/StatIndet/daybook/internal/search"
)

func TestBuildPublishesEveryNonDraftNote(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout")
	writeTestFile(t, vault, "notes/regular.md", "---\ntitle: Regular\ndate: 2026-01-01\ntags: [RegularTag]\n---\nLink to [[pair-zh]].")
	// Old vaults may still contain the removed attribute. It must neither hide
	// a published note nor suppress its translation, tags or graph links.
	writeTestFile(t, vault, "notes/pair-zh.md", "---\ntitle: 中文版本\ndate: 2026-01-02\ni18n_key: pair\nlisted: false\ntags: [ChineseTag]\n---\nLink to [[regular]].")
	writeTestFile(t, vault, "notes/pair-en.md", "---\ntitle: English version\ndate: 2026-01-02\nlang: en_US\ni18n_key: pair\nlisted: false\ntags: [EnglishTag]\n---\nEnglish body.")
	writeTestFile(t, vault, "notes/draft.md", "---\ntitle: Draft only\ndate: 2026-01-03\ndraft: true\ntags: [DraftTag]\n---\nUnpublished body.")

	result, err := Build(Options{Config: config.Config{}, ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Notes) != 3 || len(result.Skipped) != 0 {
		t.Fatalf("build result = %d notes, %v skipped; want all three published notes", len(result.Notes), result.Skipped)
	}
	wantURLs := []string{"/notes/regular/", "/notes/pair-zh/", "/en_US/notes/pair-en/"}
	for _, prefix := range []string{"", "/en_US"} {
		list := readPublicAsset(t, publicDir, prefix+"/notes/index.html")
		if strings.Count(list, "data-note-card") != 3 {
			t.Errorf("%s notes list must contain every published version", prefix)
		}
		archive := readPublicAsset(t, publicDir, prefix+"/archive/data.json")
		rss := readPublicAsset(t, publicDir, prefix+"/rss.xml")
		if !strings.Contains(archive, `"total":3`) || strings.Count(rss, "<item>") != 3 {
			t.Errorf("%s archive and RSS must contain all three published notes", prefix)
		}
		for _, url := range wantURLs {
			if !strings.Contains(list, `href="`+url+`"`) || !strings.Contains(archive, `"url":"`+url+`"`) || !strings.Contains(rss, "<link>"+url+"</link>") {
				t.Errorf("%s collections missing published article %s", prefix, url)
			}
		}
		for _, tag := range []string{"RegularTag", "ChineseTag", "EnglishTag"} {
			if !fileExists(filepath.Join(publicDir, prefix, "tags", tag, "index.html")) || !strings.Contains(list, `href="`+prefix+"/tags/"+tag+`/"`) {
				t.Errorf("%s missing published tag %s", prefix, tag)
			}
		}
		if strings.Contains(archive, "Draft only") || strings.Contains(rss, "Draft only") || strings.Contains(list, "Draft only") || fileExists(filepath.Join(publicDir, prefix, "tags", "DraftTag", "index.html")) {
			t.Errorf("%s collections must exclude drafts", prefix)
		}

		var data graph.Data
		if err := json.Unmarshal([]byte(readPublicAsset(t, publicDir, prefix+"/graph.json")), &data); err != nil {
			t.Fatal(err)
		}
		if len(data.Nodes) != 3 || len(data.Links) != 2 {
			t.Fatalf("%s graph has %d nodes, %d links; want three published notes and two directed citations", prefix, len(data.Nodes), len(data.Links))
		}
		nodeURLs := make(map[string]bool)
		for _, node := range data.Nodes {
			nodeURLs[node.ID] = node.Exists
		}
		for _, url := range wantURLs {
			if !nodeURLs[url] {
				t.Errorf("%s graph missing published node %s", prefix, url)
			}
		}
		link := data.Links[0]
		if !(link.Source == "/notes/regular/" && link.Target == "/notes/pair-zh/" || link.Source == "/notes/pair-zh/" && link.Target == "/notes/regular/") {
			t.Errorf("%s graph link does not connect the published articles: %+v", prefix, link)
		}
	}

	sitemap := readPublicAsset(t, publicDir, "/sitemap.xml")
	for _, url := range wantURLs {
		if strings.Count(sitemap, "<loc>"+url+"</loc>") != 1 || !fileExists(filepath.Join(publicDir, url, "index.html")) {
			t.Errorf("published article %s must have a page and one sitemap entry", url)
		}
	}
	var index []search.IndexItem
	if err := json.Unmarshal([]byte(readPublicAsset(t, publicDir, "/search.json")), &index); err != nil {
		t.Fatal(err)
	}
	searchURLs := make(map[string]bool)
	for _, item := range index {
		for _, version := range item.Versions {
			searchURLs[version.URL] = true
		}
	}
	if len(searchURLs) != 3 {
		t.Errorf("search index contains %d versions, want three published notes", len(searchURLs))
	}
	for _, url := range wantURLs {
		if !searchURLs[url] {
			t.Errorf("search index missing published article %s", url)
		}
	}
	if strings.Contains(sitemap, "/notes/draft/") || fileExists(filepath.Join(publicDir, "notes", "draft", "index.html")) {
		t.Error("draft must not have a published page or sitemap entry")
	}
}
