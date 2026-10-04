package site

import (
	"bytes"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/obsidian"
	"github.com/StatIndet/daybook/internal/progress"
)

func TestPageCountIncludesPublishedVersionsPaginationAndAliases(t *testing.T) {
	var notes []content.Note
	for i := range PageSize + 1 {
		notes = append(notes, content.Note{Slug: string(rune('a' + i)), Section: "notes", Lang: "zh_CN", Tags: []string{"one", "one"}})
	}
	notes = append(notes,
		content.Note{Slug: "a", Section: "notes", Lang: "en_US", Tags: []string{"one"}},
		content.Note{Slug: "pinned", Section: "notes", Lang: "zh_CN", Pinned: true, Tags: []string{"two"}},
		content.Note{Slug: "memo", Section: "memos", Lang: "zh_CN"},
		content.Note{Slug: "draft", Section: "notes", Lang: "zh_CN", Draft: true, Tags: []string{"private"}},
	)
	canonical := make(map[string]bool)
	for _, note := range notes {
		prefix := ""
		if note.Lang == "en_US" {
			prefix = "en_US"
		}
		if !note.Draft {
			canonical[joinURL("/", prefix, note.Section, note.Slug)] = true
		}
	}
	groups, err := content.GroupNotes(notes)
	if err != nil {
		t.Fatal(err)
	}
	tags, err := content.NewTagRegistry(notes)
	if err != nil {
		t.Fatal(err)
	}
	// Two language passes: 5 fixed pages + 2 note pages + 1 pagination alias +
	// (2 pages + alias for tag one) + (1 page + alias for tag two) = 13 each.
	// Published content produces two routes per unique slug; the translated 'a'
	// shares the existing canonical routes instead of creating two extra aliases.
	want := 26 + 2*(PageSize+3)
	if got := pageCount(groups, []string{"zh_CN", "en_US"}, tags, canonical); got != want {
		t.Fatalf("page count = %d, want %d", got, want)
	}
}

func TestDiagnosticsPersistOnceAcrossUILanguages(t *testing.T) {
	var log bytes.Buffer
	r := progress.NewReporter(nil, progress.Options{Writer: &log})
	seen := make(map[string]bool)
	diagnostics := []obsidian.Diagnostic{{Code: "obsidian/unresolved-note", SourcePath: "/vault/notes/鲸歌.md", Line: 24, Column: 3, Message: "missing note"}}
	reportDiagnostics(r, "/vault", diagnostics, seen)
	reportDiagnostics(r, "/vault", diagnostics, seen)
	r.Done("Built site")
	if strings.Count(log.String(), "WARN  notes/鲸歌.md:24:3") != 1 || !strings.Contains(log.String(), "1 warnings") {
		t.Fatal(log.String())
	}
}
