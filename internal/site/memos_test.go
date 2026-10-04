package site

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/graph"
	"github.com/StatIndet/daybook/internal/render"
	"github.com/StatIndet/daybook/internal/search"
	"golang.org/x/net/html"
)

func TestMemoCardNamespacesFragments(t *testing.T) {
	body := `<h2 id="heading">A <em>small</em> thought</h2><p id="fnref:1"><a href="#fn:1">1</a></p><div id="fn:1"><a href="#fnref:1">back</a></div><a href="/notes/other/#heading">other</a><label for="field">label</label><input id="field" aria-describedby="heading fn:1">`
	first, err := buildMemoCard(render.NoteLink{URL: "/memos/a/", Date: "2026-10-02T23:40:00+08:00"}, "路上", body)
	if err != nil {
		t.Fatal(err)
	}
	second, err := buildMemoCard(render.NoteLink{URL: "/memos/b/", Date: "2026-10-02"}, "", body)
	if err != nil {
		t.Fatal(err)
	}
	if first.DateDay != "2026-10-02" || first.DateDisplay != "2026-10-02" || second.DateDisplay != "2026-10-02" {
		t.Fatalf("unexpected date display: %+v / %+v", first, second)
	}
	if !strings.Contains(first.SearchText, "A small thought") {
		t.Fatalf("lost inline text: %s", first.SearchText)
	}
	combined := string(first.HTML) + string(second.HTML)
	ids := map[string]bool{}
	var fragments []string
	z := html.NewTokenizer(strings.NewReader(combined))
	for z.Next() != html.ErrorToken {
		token := z.Token()
		for _, attr := range token.Attr {
			if attr.Key == "id" {
				if ids[attr.Val] {
					t.Fatalf("duplicate id: %s", attr.Val)
				}
				ids[attr.Val] = true
			}
			if attr.Key == "href" && strings.HasPrefix(attr.Val, "#") {
				fragments = append(fragments, attr.Val[1:])
			}
		}
	}
	for _, id := range fragments {
		if !ids[id] {
			t.Errorf("dangling fragment %s", id)
		}
	}
	if !strings.Contains(combined, `href="/notes/other/#heading"`) {
		t.Error("external article fragment changed")
	}
}

func TestBuildMemosWithSharedContentFeatures(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout this blog.")
	writeTestFile(t, vault, "notes/shared.md", "---\ntitle: obsolete title\ndate: 2026-10-01\n---\n[[memos/shared]]")
	writeTestFile(t, vault, "memos/shared.md", "---\ndate: 2026-10-02T23:30:00+08:00\nlocation: 路上\ntags: [生活]\n---\n[[notes/shared]]\n\n## One\nA **memo** with a footnote.[^1]\n\n[^1]: First footnote.\n\n$E=mc^2$\n\n- [x] Done")
	writeOGTestImage(t, vault, "attachments/photo.png")
	writeTestFile(t, vault, "memos/2026/窗边.md", "---\ndate: 2026-10-02T17:00:00Z\n---\n## One\nNewer in absolute time.[^1]\n\n[^1]: Second footnote.\n\n```mermaid\ngraph TD\nA-->B\n```\n\n::image{src=\"/attachments/photo.png\" alt=\"窗外\"}")
	writeTestFile(t, vault, "memos/english.md", "---\ndate: 2026-10-01\nlang: en_US\n---\nEnglish memo")
	writeTestFile(t, vault, "memos/draft.md", "---\ndraft: true\n---\nDo not publish")
	writeTestFile(t, vault, "memos/invalid.md", "---\ndate: 2026-02-30\n---\nInvalid date")
	cfg := config.Config{Comment: config.CommentConfig{Enabled: true, Provider: "giscus", Giscus: config.GiscusConfig{Repo: "owner/blog", RepoID: "R_repo", Category: "Announcements", CategoryID: "DIC_category"}}}
	result, err := Build(Options{Config: cfg, ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Notes) != 1 || len(result.Memos) != 3 || len(result.Skipped) != 1 || !strings.Contains(result.Skipped[0], "invalid.md") {
		t.Fatalf("unexpected result: %+v", result)
	}
	for _, prefix := range []string{"", "/en_US"} {
		feed := readPublicAsset(t, publicDir, prefix+"/memos/index.html")
		if strings.Count(feed, "data-memo-card") != 3 {
			t.Errorf("%s must list all published memos", prefix)
		}
		if strings.Index(feed, `data-memo-url="/memos/2026/窗边/"`) > strings.Index(feed, `data-memo-url="/memos/shared/"`) {
			t.Error("memos must sort by actual time")
		}
		for _, want := range []string{"<strong>memo</strong>", "math-inline", "mermaid", "路上", "生活"} {
			if !strings.Contains(feed, want) {
				t.Errorf("feed lost %s", want)
			}
		}
		if strings.Contains(feed, "Do not publish") || strings.Contains(feed, "Invalid date") {
			t.Error("unpublished memo leaked")
		}
		notes := readPublicAsset(t, publicDir, prefix+"/notes/index.html")
		if strings.Count(notes, "data-note-card") != 1 {
			t.Error("notes list includes memos")
		}
		var archive struct {
			Total int                 `json:"total"`
			Rows  []render.ArchiveRow `json:"rows"`
		}
		if err := json.Unmarshal([]byte(readPublicAsset(t, publicDir, prefix+"/archive/data.json")), &archive); err != nil {
			t.Fatal(err)
		}
		if archive.Total != 1 {
			t.Errorf("archive counts memos: %d", archive.Total)
		}
		for _, row := range archive.Rows {
			if row.Type == "note" && row.URL != "/notes/shared/" {
				t.Errorf("archive includes memo: %s", row.URL)
			}
		}
		archiveHTML := readPublicAsset(t, publicDir, prefix+"/archive/index.html")
		if strings.Contains(archiveHTML, `data-archive-row-id="note:/memos/`) || strings.Contains(archiveHTML, `data-mobile-tag="生活"`) {
			t.Error("archive HTML includes memo rows or memo-only tags")
		}
		var graphData graph.Data
		if err := json.Unmarshal([]byte(readPublicAsset(t, publicDir, prefix+"/graph.json")), &graphData); err != nil {
			t.Fatal(err)
		}
		if len(graphData.Nodes) != 4 || len(graphData.Links) != 2 {
			t.Fatalf("shared graph: %+v", graphData)
		}
		link := graphData.Links[0]
		if !(link.Source == "/notes/shared/" && link.Target == "/memos/shared/" || link.Target == "/notes/shared/" && link.Source == "/memos/shared/") {
			t.Errorf("wrong cross-section edge: %+v", link)
		}
	}
	detail := readPublicAsset(t, publicDir, "/memos/shared/index.html")
	for _, unwanted := range []string{"data-reader-toggle", "data-reader-exit", `class="reading-time"`, `data-mobile-progress-text`} {
		if strings.Contains(detail, unwanted) {
			t.Errorf("memo detail contains %s", unwanted)
		}
	}
	for _, want := range []string{`data-page-kind="memo"`, `data-path="/memos/shared/"`, `href="/notes/shared/"`, `id="fn:1"`, "post-content"} {
		if !strings.Contains(detail, want) {
			t.Errorf("detail missing %s", want)
		}
	}
	if strings.Contains(readPublicAsset(t, publicDir, "/notes/shared/index.html"), "obsolete title") {
		t.Error("frontmatter title still used")
	}
	var index []search.IndexItem
	if err := json.Unmarshal([]byte(readPublicAsset(t, publicDir, "/search.json")), &index); err != nil {
		t.Fatal(err)
	}
	if len(index) != 4 {
		t.Errorf("search missing content: %d items", len(index))
	}
	for _, item := range index {
		for _, version := range item.Versions {
			if version.Section == "memos" && (version.ReadingTime != "" || version.ReadingMinutes != 0) {
				t.Error("memo search result contains reading statistics")
			}
		}
	}
	for _, url := range []string{"/memos/", "/memos/shared/", "/memos/2026/窗边/", "/en_US/memos/english/"} {
		if !strings.Contains(readPublicAsset(t, publicDir, "/sitemap.xml"), "<loc>"+url+"</loc>") {
			t.Errorf("sitemap missing %s", url)
		}
	}
}

func TestMemosPinOrdering(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout.")
	writeTestFile(t, vault, "memos/latest.md", "---\ndate: 2026-10-03\n---\nLatest memo.")
	writeTestFile(t, vault, "memos/ordinary.md", "---\ndate: 2026-10-02\npinned: false\n---\nOrdinary memo.")
	writeTestFile(t, vault, "memos/pinned-older.md", "---\ndate: 2026-01-02T23:00:00+08:00\npinned: true\n---\nOlder pin.")
	for _, state := range []struct {
		name  string
		pin   string
		order []string
		count int
	}{
		{"pinned", "true", []string{"pinned-newer", "pinned-older", "latest", "ordinary"}, 2},
		{"unpinned", "false", []string{"pinned-older", "latest", "ordinary", "pinned-newer"}, 1},
	} {
		t.Run(state.name, func(t *testing.T) {
			writeTestFile(t, vault, "memos/pinned-newer.md", "---\ndate: 2026-01-02T17:00:00Z\npinned: "+state.pin+"\n---\nNewer pin.")
			if _, err := Build(Options{ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir}); err != nil {
				t.Fatal(err)
			}
			for _, prefix := range []string{"", "/en_US"} {
				feed := readPublicAsset(t, publicDir, prefix+"/memos/index.html")
				previous := -1
				for _, slug := range state.order {
					position := strings.Index(feed, `data-memo-url="/memos/`+slug+`/"`)
					if position <= previous {
						t.Fatalf("%s: %s is missing or out of order, want %v", prefix, slug, state.order)
					}
					previous = position
				}
				if count := strings.Count(feed, `data-ui-aria="memos.pinned"`); count != state.count {
					t.Errorf("%s: got %d pin markers, want %d", prefix, count, state.count)
				}
			}
		})
	}
}
