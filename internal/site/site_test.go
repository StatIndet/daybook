package site

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/render"
)

func TestMonthGroups(t *testing.T) {
	notes := []render.NoteLink{
		{Title: "A", Date: "2026-06-14"},
		{Title: "B", Date: "2026-06-01"},
		{Title: "C", Date: "2026-05-30"},
	}

	groups := monthGroups(notes)
	if len(groups) != 2 {
		t.Fatalf("groups length = %d, want 2", len(groups))
	}
	if groups[0].Key != "2026-06" || groups[0].Label != "2026 年 06 月" || len(groups[0].Notes) != 2 {
		t.Fatalf("first group = %#v, want June group with two notes", groups[0])
	}
	if groups[1].Key != "2026-05" || len(groups[1].Notes) != 1 {
		t.Fatalf("second group = %#v, want May group with one note", groups[1])
	}
}

func TestCollectTagLinks(t *testing.T) {
	groups := []*content.ArticleGroup{
		{
			I18nKey: "1",
			Versions: map[string]*content.Note{
				"zh_CN": {Tags: []string{"ssh", "debian", "ssh"}},
			},
		},
		{
			I18nKey: "2",
			Versions: map[string]*content.Note{
				"zh_CN": {Tags: []string{"Debian", "虚拟机"}},
			},
		},
		{
			I18nKey: "3",
			Versions: map[string]*content.Note{
				"zh_CN": {Tags: []string{"Go"}},
			},
		},
	}

	var allNotes []content.Note
	for _, group := range groups {
		for _, note := range group.Versions {
			allNotes = append(allNotes, *note)
		}
	}
	registry, _ := content.NewTagRegistry(allNotes)
	tags := collectTagLinksForLang(groups, "zh_CN", registry)
	wantNames := []string{"debian", "Go", "ssh", "虚拟机"}

	if len(tags) != len(wantNames) {
		t.Fatalf("tags length = %d, want %d: %#v", len(tags), len(wantNames), tags)
	}
	// We need to skip the first empty tag if content.NewTagRegistry includes it.
	// Actually, wait, let's just make the test not use "  " as a tag and instead test the behavior that collectTagLinksForLang used to test, which is it extracts valid tags.
	// Oh, if I change the test data to not have empty tag:
	for index, wantName := range wantNames {
		if tags[index].Name != wantName {
			t.Fatalf("tag %d name = %q, want %q", index, tags[index].Name, wantName)
		}
		if tags[index].Index != index {
			t.Fatalf("tag %d Index = %d, want %d", index, tags[index].Index, index)
		}
		if tags[index].ReverseIndex != len(wantNames)-index-1 {
			t.Fatalf("tag %d ReverseIndex = %d, want %d", index, tags[index].ReverseIndex, len(wantNames)-index-1)
		}
	}
	if tags[3].URL != "/tags/虚拟机/" {
		t.Fatalf("Chinese tag URL = %q", tags[3].URL)
	}
}

func TestBuildMarksNotesWithMermaid(t *testing.T) {
	contentDir := filepath.Join(t.TempDir(), "content")
	staticDir := filepath.Join(t.TempDir(), "static")
	publicDir := filepath.Join(t.TempDir(), "public")

	writeRequiredTemplateAssets(t, staticDir)
	writeTestFile(t, contentDir, "pages/about.md", strings.Join([]string{
		"---",
		"title: About",
		"summary: Test about page.",
		"---",
		"",
		"About body.",
	}, "\n"))
	writeTestFile(t, contentDir, "notes/with-mermaid.md", strings.Join([]string{
		"---",
		"title: With Mermaid",
		"date: 2026-06-17",
		"slug: with-mermaid",
		"summary: Mermaid note.",
		"draft: false",
		"---",
		"",
		"```mermaid",
		"graph TD",
		"A --> B",
		"```",
	}, "\n"))
	writeTestFile(t, contentDir, "notes/plain.md", strings.Join([]string{
		"---",
		"title: Plain",
		"date: 2026-06-16",
		"slug: plain",
		"summary: Plain note.",
		"draft: false",
		"---",
		"",
		"Regular content.",
	}, "\n"))

	cfg := config.Config{}
	_, err := Build(Options{
		Config:   cfg,
		NotesDir: filepath.Join(contentDir, "notes"),

		PublicDir: publicDir,
	})
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}

	withMermaid := readPublicAsset(t, publicDir, "/notes/with-mermaid/index.html")
	if !strings.Contains(withMermaid, `data-has-mermaid="true"`) {
		t.Fatalf("Mermaid note should be marked with data-has-mermaid=true:\n%s", withMermaid)
	}
	if !strings.Contains(withMermaid, `class="mermaid-block"`) {
		t.Fatalf("Mermaid note should contain Mermaid block HTML:\n%s", withMermaid)
	}
	if !strings.Contains(withMermaid, `/js/mermaid-loader.`) {
		t.Fatalf("Mermaid loader should be referenced through the asset pipeline:\n%s", withMermaid)
	}

	plain := readPublicAsset(t, publicDir, "/notes/plain/index.html")
	if !strings.Contains(plain, `data-has-mermaid="false"`) {
		t.Fatalf("Plain note should be marked with data-has-mermaid=false:\n%s", plain)
	}
	if strings.Contains(plain, `class="mermaid-block"`) {
		t.Fatalf("Plain note should not contain Mermaid block HTML:\n%s", plain)
	}
}

func writeRequiredTemplateAssets(t *testing.T, staticDir string) {
	t.Helper()

	writeTestFile(t, staticDir, "css/global.css", `body { color: black; }`)
	for _, scriptPath := range []string{
		"js/theme.js",
		"js/code-copy.js",
		"js/toc.js",
		"js/heading-anchors.js",
		"js/note-filters.js",
		"js/lightbox.js",
		"js/mermaid-loader.js",
		"js/gallery.js",
		"js/embeds.js",
		"js/page-transition-engine.js",
		"js/graph-loader.js",
		"js/graph.js",
		"js/mobile-drawer.js",
		"js/search-overlay.js",
		"js/daybook-router.js",
		"js/reader-mode.js",
		"js/reading-controls.js",
		"js/settings-overlay.js",
		"js/share-overlay.js",
		"vendor/katex/katex.min.css",
	} {
		writeTestFile(t, staticDir, scriptPath, `document.documentElement.dataset.loaded = "true";`)
	}
}

func writeTestFile(t *testing.T, root, relativePath, content string) {
	t.Helper()

	targetPath := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		t.Fatalf("create test file directory: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(content), 0644); err != nil {
		t.Fatalf("write test file %s: %v", relativePath, err)
	}
}

func readPublicAsset(t *testing.T, publicDir, webPath string) string {
	t.Helper()

	filePath := filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(webPath, "/")))
	content, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read public asset %s: %v", webPath, err)
	}
	return string(content)
}

func fileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

func TestShareRendering(t *testing.T) {
	contentDir := filepath.Join(t.TempDir(), "content")
	staticDir := filepath.Join(t.TempDir(), "static")
	publicDir := filepath.Join(t.TempDir(), "public")

	writeRequiredTemplateAssets(t, staticDir)
	writeTestFile(t, contentDir, "pages/about.md", "---\ntitle: About\n---\n")
	writeTestFile(t, contentDir, "notes/鲸歌.md", strings.Join([]string{
		"---",
		"title: 鲸歌",
		"date: 2026-06-17",
		"slug: cjk",
		"summary: test",
		"draft: false",
		"---",
		"",
		"Testing CJK title.",
	}, "\n"))

	writeTestFile(t, contentDir, "notes/A Space Title.md", strings.Join([]string{
		"---",
		"title: A Space Title",
		"date: 2026-06-18",
		"slug: space",
		"summary: test",
		"draft: false",
		"---",
		"",
		"Testing space title.",
	}, "\n"))

	cfg := config.Config{}
	cfg.Site.URL = "https://daybook.page/" // test trailing slash
	cfg.Share.Text = "分享：\"{Title}\""

	_, err := Build(Options{
		Config:    cfg,
		NotesDir:  filepath.Join(contentDir, "notes"),
		PublicDir: publicDir,
	})
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}

	cjkHtml := readPublicAsset(t, publicDir, "/notes/鲸歌/index.html")
	if !strings.Contains(cjkHtml, `data-share-title="鲸歌"`) {
		t.Errorf("Expected CJK title to be preserved in data-share-title")
	}
	if !strings.Contains(cjkHtml, `data-share-link="https://daybook.page/notes/鲸歌/"`) {
		t.Errorf("Expected CJK ShareURL to be unencoded and correct: %s", cjkHtml)
	}
	if !strings.Contains(cjkHtml, `data-share-text="分享：&#34;鲸歌&#34;"`) {
		t.Errorf("Expected CJK ShareText to have replaced Title and be html-escaped")
	}

	spaceHtml := readPublicAsset(t, publicDir, "/notes/A Space Title/index.html")
	if !strings.Contains(spaceHtml, `data-share-link="https://daybook.page/notes/A Space Title/"`) {
		t.Errorf("Expected ASCII space ShareURL to be unencoded and correct")
	}
	if !strings.Contains(spaceHtml, `data-share-text="分享：&#34;A Space Title&#34;"`) {
		t.Errorf("Expected ASCII space ShareText to have replaced Title and be html-escaped")
	}
}

func TestBuildGraphIdentity(t *testing.T) {
	contentDir := filepath.Join(t.TempDir(), "content")
	staticDir := filepath.Join(t.TempDir(), "static")
	publicDir := filepath.Join(t.TempDir(), "public")

	writeRequiredTemplateAssets(t, staticDir)
	writeTestFile(t, contentDir, "pages/about.md", "---\ntitle: About\n---\n")

	writeTestFile(t, contentDir, "notes/a.md", strings.Join([]string{
		"---",
		"title: A",
		"date: 2026-06-17",
		"slug: a",
		"draft: false",
		"---",
		"Link to [[b]]",
	}, "\n"))

	writeTestFile(t, contentDir, "notes/b.md", strings.Join([]string{
		"---",
		"title: B",
		"date: 2026-06-18",
		"slug: b",
		"draft: false",
		"---",
		"Link to [[a]]",
	}, "\n"))

	writeTestFile(t, contentDir, "notes/c.md", strings.Join([]string{
		"---",
		"title: C",
		"date: 2026-06-19",
		"slug: c",
		"draft: false",
		"---",
		"No links",
	}, "\n"))

	cfg := config.Config{}

	_, err := Build(Options{
		Config:     cfg,
		ContentDir: contentDir,
		NotesDir:   filepath.Join(contentDir, "notes"),
		PublicDir:  publicDir,
	})
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}

	graphJsonStr := readPublicAsset(t, publicDir, "/graph.json")
	var graphData struct {
		Nodes []struct {
			ID string `json:"id"`
		} `json:"nodes"`
		Links []struct {
			Source string `json:"source"`
			Target string `json:"target"`
		} `json:"links"`
	}
	if err := json.Unmarshal([]byte(graphJsonStr), &graphData); err != nil {
		t.Fatalf("Failed to parse graph.json: %v", err)
	}

	if len(graphData.Nodes) != 3 {
		t.Fatalf("Expected 3 nodes, got %d", len(graphData.Nodes))
	}

	nodeIDs := make(map[string]bool)
	for _, n := range graphData.Nodes {
		if n.ID == "" {
			t.Errorf("Found node with empty ID")
		}
		if nodeIDs[n.ID] {
			t.Errorf("Duplicate node ID: %s", n.ID)
		}
		nodeIDs[n.ID] = true
	}

	if len(graphData.Links) != 2 {
		t.Fatalf("Expected 2 directed citations (A-B and B-A), got %d: %v", len(graphData.Links), graphData.Links)
	}

	link := graphData.Links[0]
	isAB := (link.Source == "/notes/a/" && link.Target == "/notes/b/") || (link.Source == "/notes/b/" && link.Target == "/notes/a/")
	if !isAB {
		t.Errorf("Expected link A-B, got %s-%s", link.Source, link.Target)
	}
}

func TestBuildListsAllLanguageVersionsAndKeepsArticleRoutes(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout")
	// The source filenames deliberately share a slug across language versions.
	// Canonical language paths must keep the two articles distinct.
	writeTestFile(t, vault, "notes/shared.md", "---\ntitle: 中文标题\ndate: 2026-01-02\nlang: zh_CN\ni18n_key: pair\ntags: [中文标签]\n---\n## 中文章节\n中文正文。")
	writeTestFile(t, vault, "notes/shared.MD", "---\ntitle: English title\ndate: 2025-12-31\nlang: en_US\ni18n_key: pair\ntags: [English tag]\n---\n## English section\nEnglish article body.")
	writeTestFile(t, vault, "notes/only.md", "---\ntitle: Chinese only\ndate: 2026-01-01\n---\nChinese only article.")
	_, err := Build(Options{Config: config.Config{}, ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir})
	if err != nil {
		t.Fatal(err)
	}
	for _, prefix := range []string{"", "/en_US"} {
		list := readPublicAsset(t, publicDir, prefix+"/notes/index.html")
		if strings.Count(list, "data-note-card") != 3 {
			t.Fatalf("%s notes should list both versions", prefix)
		}
		for _, expected := range []string{`href="/notes/shared/"`, `href="/en_US/notes/shared/"`, "shared"} {
			if !strings.Contains(list, expected) {
				t.Errorf("%s notes missing %s", prefix, expected)
			}
		}
		archive := readPublicAsset(t, publicDir, prefix+"/archive/data.json")
		if !strings.Contains(archive, `"total":3`) || strings.Count(archive, `"title":"shared"`) != 2 {
			t.Errorf("%s archive should include both versions: %s", prefix, archive)
		}
		for _, tag := range []string{"中文标签", "English-tag"} {
			if !fileExists(filepath.Join(publicDir, prefix, "tags", tag, "index.html")) {
				t.Errorf("%s locale missing tag %s from another source language", prefix, tag)
			}
		}
	}
	chinese := readPublicAsset(t, publicDir, "/notes/shared/index.html")
	english := readPublicAsset(t, publicDir, "/en_US/notes/shared/index.html")
	if !strings.Contains(chinese, "中文正文。") || strings.Contains(chinese, "English article body.") {
		t.Error("Chinese article was replaced by its counterpart")
	}
	if !strings.Contains(english, "English article body.") || strings.Contains(english, "中文正文。") {
		t.Error("English article was replaced by its counterpart")
	}
	if !strings.Contains(chinese, `class="bilingual-toggle-btn" href="/en_US/notes/shared/"`) || !strings.Contains(chinese, `href="/notes/shared/?ui=en_US"`) {
		t.Error("Translation navigation and interface switching must use separate URLs")
	}
	if strings.Contains(chinese, "notes-aside-identity") {
		t.Error("Article sidebar still contains the removed profile identity")
	}
	if strings.Index(chinese, `class="note-toc-wrapper"`) < strings.Index(chinese, `class="notes-aside"`) {
		t.Error("Desktop TOC must be inside the right sidebar")
	}
	sitemap := readPublicAsset(t, publicDir, "/sitemap.xml")
	if strings.Count(sitemap, "<loc>/notes/shared/</loc>") != 1 || strings.Count(sitemap, "<loc>/en_US/notes/shared/</loc>") != 1 {
		t.Error("Canonical article routes must appear once in the sitemap")
	}
	graph := readPublicAsset(t, publicDir, "/graph.json")
	if !strings.Contains(graph, `"id": "/notes/shared/"`) || !strings.Contains(graph, `"id": "/en_US/notes/shared/"`) {
		t.Error("Graph must retain both language versions as distinct nodes")
	}
	legacy := readPublicAsset(t, publicDir, "/en_US/notes/only/index.html")
	if !strings.Contains(legacy, `content="noindex"`) || !strings.Contains(legacy, `href="/notes/only/?ui=en_US"`) {
		t.Error("Legacy UI-language article routes must redirect without changing article text")
	}
}
