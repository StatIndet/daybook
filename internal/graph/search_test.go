package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/markdown"
)

func TestSearchDocumentUsesPublishedTextAndSectionBoundaries(t *testing.T) {
	body := "Intro **public** text.\nSecond line.\n\n%% private-inline %%\n\n%%\nprivate-block\n%%\n\n<!-- private-html -->\n\n## 第一章\n甲\n乙\n\n```md\n# not-a-section\n%% visible-code %%\n```\n\n## 第二章\n丙 丁\n\n<script>private-script</script>"
	publicHTML, err := markdown.ToHTML(body)
	if err != nil {
		t.Fatal(err)
	}
	document := NewSearchDocument(content.Note{URL: "/notes/test/"}, publicHTML, nil)
	if len(document.Sections) != 3 {
		t.Fatalf("sections = %#v, want intro and two real headings", document.Sections)
	}
	for _, hidden := range []string{"private-inline", "private-block", "private-html", "private-script", "content_copy"} {
		if strings.Contains(document.Text, hidden) {
			t.Errorf("index includes hidden/generated text %q: %s", hidden, document.Text)
		}
	}
	for _, visible := range []string{"Intro public text.", "第一章", "not-a-section", "%% visible-code %%", "丙 丁"} {
		if !strings.Contains(document.Text, visible) {
			t.Errorf("index lost public text %q: %s", visible, document.Text)
		}
	}
	if !strings.Contains(document.Sections[1], "甲\n乙") || strings.Contains(document.Sections[1], "丙") {
		t.Errorf("section boundaries were lost: %#v", document.Sections)
	}
	for _, line := range document.Lines {
		if strings.Contains(line, "甲") && strings.Contains(line, "乙") {
			t.Errorf("separate source lines were combined: %q", line)
		}
	}
}

func TestSearchDocumentExportsOnlyApprovedProperties(t *testing.T) {
	note, err := content.Parse("/vault/notes/real-title.md", "---\ndate: 2026-10-04\ntitle: ignored-title\ntags: [旅行/中国]\nsecret: never-export\nstatus: complete\nscore: 7.5\nflag: true\nempty: null\nreviewed: 2026-10-03\naliases: [first, second]\nnested: {secret: private}\ninvalid-list: [one, {two: three}]\n---\nHello", "real-title")
	if err != nil {
		t.Fatal(err)
	}
	without := NewSearchDocument(note, "<p>Hello</p>", nil)
	if _, exists := without.Properties["status"]; exists {
		t.Fatal("custom properties must be private by default")
	}
	doc := NewSearchDocument(note, "<p>Hello</p>", []string{"title", "status", "score", "flag", "empty", "reviewed", "aliases", "nested", "invalid-list", "missing"})
	if doc.Properties["title"] != "real-title" || doc.Properties["status"] != "complete" || doc.Properties["score"] != 7.5 || doc.Properties["flag"] != true {
		t.Fatalf("incorrect exported scalar properties: %#v", doc.Properties)
	}
	if !reflect.DeepEqual(doc.Properties["aliases"], []any{"first", "second"}) || doc.Properties["reviewed"] != "2026-10-03T00:00:00Z" {
		t.Fatalf("incorrect list or timestamp properties: %#v", doc.Properties)
	}
	if value, exists := doc.Properties["empty"]; !exists || value != nil {
		t.Fatal("an explicitly allowed null property must preserve its existence")
	}
	for _, key := range []string{"secret", "nested", "invalid-list", "missing"} {
		if _, exists := doc.Properties[key]; exists {
			t.Errorf("unexpected exported property: %s", key)
		}
	}
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "/vault/") || strings.Contains(string(data), "never-export") {
		t.Fatalf("private metadata leaked: %s", data)
	}
}

func TestSearchTextExcludesHiddenHTMLAndPreservesInlineText(t *testing.T) {
	lines, sections := searchText(`<p>中文<em>强调</em> &amp; text<br>next</p><div hidden>hidden</div><p aria-hidden="true">assistive</p><span style="display: none">invisible</span><button>copy</button><pre><code># code
second code line</code></pre><h2>Heading</h2><p>body</p>`)
	if len(sections) != 2 || !reflect.DeepEqual(lines, []string{"中文强调 & text", "next", "# code", "second code line", "Heading", "body"}) {
		t.Fatalf("text extraction lost structure: %#v / %#v", lines, sections)
	}
}

func TestSearchTextExcludesEmbedControlsAndPreservesTableRows(t *testing.T) {
	body := "> [!note]- Callout title\n> Useful text.\n\n::github{repo=\"StatIndet/daybook\"}\n\n::music{url=\"https://example.com/music.mp3\" title=\"Song title\" artist=\"Artist name\"}\n\n| First | Second |\n| --- | --- |\n| 甲 | 乙 |\n\n## Section\nVisible body."
	publicHTML, err := markdown.ToHTML(body)
	if err != nil {
		t.Fatal(err)
	}
	doc := NewSearchDocument(content.Note{URL: "/notes/test/"}, publicHTML, nil)
	for _, noise := range []string{"info", "expand_more", "Loading repository data", "0:00", "play_arrow", "--"} {
		if strings.Contains(doc.Text, noise) {
			t.Errorf("index includes generated UI %q: %s", noise, doc.Text)
		}
	}
	for _, visible := range []string{"Callout title", "Useful text", "StatIndet/daybook", "Song title", "Artist name"} {
		if !strings.Contains(doc.Text, visible) {
			t.Errorf("index lost authored embed content %q: %s", visible, doc.Text)
		}
	}
	foundRow := false
	for _, line := range doc.Lines {
		if strings.Contains(line, "甲") && strings.Contains(line, "乙") {
			foundRow = true
		}
	}
	if !foundRow {
		t.Errorf("one table row should remain one line query scope: %#v", doc.Lines)
	}
}

func TestSearchTextIgnoresHiddenHTMLWithCSSWhitespace(t *testing.T) {
	lines, _ := searchText("<p>Public</p><p style=\"display:\n\tnone !important\">hidden-css</p><span aria-hidden=\"TRUE\">hidden-aria</span><pre><code>&lt;script&gt;public code&lt;/script&gt;</code></pre>")
	if !reflect.DeepEqual(lines, []string{"Public", "<script>public code</script>"}) {
		t.Fatalf("hidden HTML filtering affected published code: %#v", lines)
	}
}

func TestBuildSearchJSONEmptyIndex(t *testing.T) {
	path := filepath.Join(t.TempDir(), "graph-search.json")
	if err := BuildSearchJSON(nil, path); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `{"version":1,"documents":[]}` {
		t.Fatalf("unexpected empty index: %s", data)
	}
}
