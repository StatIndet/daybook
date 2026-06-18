package site

import (
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
	notes := []content.Note{
		{Tags: []string{"ssh", "debian", "ssh"}},
		{Tags: []string{"Debian", "虚拟机"}},
		{Tags: []string{"  ", "Go"}},
	}

	tags := collectTagLinks(notes)
	wantNames := []string{"debian", "Go", "ssh", "虚拟机"}

	if len(tags) != len(wantNames) {
		t.Fatalf("tags length = %d, want %d: %#v", len(tags), len(wantNames), tags)
	}
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
	if tags[3].URL != "/notes/?tag=%E8%99%9A%E6%8B%9F%E6%9C%BA" {
		t.Fatalf("Chinese tag URL = %q", tags[3].URL)
	}
}

func TestBuildAssetsFingerprintsCSSImportsAndJS(t *testing.T) {
	staticDir := filepath.Join(t.TempDir(), "static")
	publicDir := filepath.Join(t.TempDir(), "public")

	writeTestFile(t, staticDir, "css/global.css", strings.Join([]string{
		`@import "/css/a.css";`,
		`@import '/css/b.css';`,
		`@import url("/css/c.css");`,
		`@import url('/css/d.css');`,
		`@import url(e.css);`,
		`@import url("nested.css");`,
		`@import url("https://example.com/foo.css");`,
		`body { color: red; }`,
	}, "\n"))
	writeTestFile(t, staticDir, "css/a.css", `.a { color: red; }`)
	writeTestFile(t, staticDir, "css/b.css", `.b { color: blue; }`)
	writeTestFile(t, staticDir, "css/c.css", `.c { color: green; }`)
	writeTestFile(t, staticDir, "css/d.css", `.d { color: yellow; }`)
	writeTestFile(t, staticDir, "css/e.css", `.e { color: black; }`)
	writeTestFile(t, staticDir, "css/nested.css", `@import url("nested-child.css"); .nested { color: pink; }`)
	writeTestFile(t, staticDir, "css/nested-child.css", `.nested-child { color: purple; }`)
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
		"js/page-transitions.js",
		"js/math-render.js",
		"vendor/katex/katex.min.css",
		"vendor/katex/katex.min.js",
	} {
		writeTestFile(t, staticDir, scriptPath, `document.documentElement.dataset.loaded = "true";`)
	}

	assets, err := buildAssets(staticDir, publicDir)
	if err != nil {
		t.Fatalf("buildAssets returned error: %v", err)
	}

	globalPath := assets.Path("/css/global.css")
	if globalPath == "/css/global.css" || !strings.HasPrefix(globalPath, "/css/global.") || !strings.HasSuffix(globalPath, ".css") {
		t.Fatalf("global css path = %q, want fingerprinted path", globalPath)
	}
	if fileExists(filepath.Join(publicDir, "css", "global.css")) {
		t.Fatal("unfingerprinted global.css should not be written")
	}

	globalContent := readPublicAsset(t, publicDir, globalPath)
	for _, oldPath := range []string{
		`"/css/a.css"`,
		`'/css/b.css'`,
		`"/css/c.css"`,
		`'/css/d.css'`,
		`url(e.css)`,
		`"nested.css"`,
	} {
		if strings.Contains(globalContent, oldPath) {
			t.Fatalf("global css still contains unfingerprinted import %q:\n%s", oldPath, globalContent)
		}
	}
	if !strings.Contains(globalContent, `https://example.com/foo.css`) {
		t.Fatalf("external import should stay unchanged:\n%s", globalContent)
	}
	if globalPath != fingerprintedAssetPath("/css/global.css", []byte(globalContent)) {
		t.Fatalf("global css hash should be based on rewritten content")
	}

	nestedPath := assets.Path("/css/nested.css")
	nestedContent := readPublicAsset(t, publicDir, nestedPath)
	if strings.Contains(nestedContent, "nested-child.css") {
		t.Fatalf("nested css still contains unfingerprinted child import:\n%s", nestedContent)
	}
	if !strings.Contains(nestedContent, assets.Path("/css/nested-child.css")) {
		t.Fatalf("nested css does not reference fingerprinted child path:\n%s", nestedContent)
	}

	themePath := assets.Path("/js/theme.js")
	if themePath == "/js/theme.js" || !strings.HasPrefix(themePath, "/js/theme.") || !strings.HasSuffix(themePath, ".js") {
		t.Fatalf("theme js path = %q, want fingerprinted path", themePath)
	}
	if fileExists(filepath.Join(publicDir, "js", "theme.js")) {
		t.Fatal("unfingerprinted theme.js should not be written")
	}

	manifest := readPublicAsset(t, publicDir, "/assets-manifest.json")
	for _, originalPath := range []string{"/css/global.css", "/css/a.css", "/css/nested-child.css", "/js/theme.js"} {
		if !strings.Contains(manifest, originalPath) {
			t.Fatalf("manifest should contain %s:\n%s", originalPath, manifest)
		}
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

	_, err := Build(Options{
		Config:       config.Default(),
		NotesDir:     filepath.Join(contentDir, "notes"),
		TemplatesDir: filepath.Join("..", "..", "templates"),
		StaticDir:    staticDir,
		PublicDir:    publicDir,
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
		"js/page-transitions.js",
		"js/math-render.js",
		"vendor/katex/katex.min.css",
		"vendor/katex/katex.min.js",
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
