package content

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseNote(t *testing.T) {
	text := `---
title: "示例笔记"
date: "2026-06-08"
slug: "example-note"
tags: ["Go", "Blog"]
summary: "一段简短摘要。"
draft: false
---

这里是笔记正文。`

	note, err := Parse("example.md", text, "example")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	if note.Title != "example" {
		t.Fatalf("Title = %q, want filename-derived title %q", note.Title, "example")
	}
	if note.URL != "/notes/example/" {
		t.Fatalf("URL = %q, want %q", note.URL, "/notes/example/")
	}
	if len(note.Tags) != 2 {
		t.Fatalf("Tags length = %d, want 2", len(note.Tags))
	}
}

func TestMemoMetadata(t *testing.T) {
	for _, parse := range []func(string, string, string) (Note, error){Parse, ParseMemo} {
		note, err := parse("entry.md", "---\ndate: 2026-10-02\npinned: true\nupdated: 2026-10-03T09:30:00+08:00\n---\nA small thought.", "entry")
		if err != nil || !note.Pinned || note.Updated != "2026-10-03T09:30:00+08:00" {
			t.Fatalf("metadata: %+v, %v", note, err)
		}
		if note.Section == "memos" {
			if note.WordCount != 0 || note.ReadingMinutes != 0 {
				t.Fatal("memos must not calculate reading statistics")
			}
		} else if note.WordCount == 0 || note.ReadingMinutes == 0 {
			t.Fatal("notes must retain reading statistics")
		}
	}
	for _, value := range []string{"", "2026-10-03", "2026-10-03T09:30:00+08:00"} {
		if _, err := ParseMemo("entry.md", "---\ndate: 2026-10-02\nupdated: "+value+"\n---\nBody", "entry"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := ParseMemo("entry.md", "---\ndate: 2026-10-02\nupdated: yesterday\n---\nBody", "entry"); err == nil {
		t.Fatal("invalid memo updated date accepted")
	}
}

func TestFilenameIsTheOnlyNoteTitle(t *testing.T) {
	for _, parse := range []func(string, string, string) (Note, error){Parse, ParseMemo} {
		note, err := parse("/vault/memos/旅行/雨后的.街道.md", "---\ndate: 2026-10-02\ntitle: {ignored: true}\n---\n不用标题属性。", "旅行/雨后的.街道")
		if err != nil {
			t.Fatal(err)
		}
		if note.Title != "雨后的.街道" {
			t.Fatalf("Title = %q", note.Title)
		}
	}
}

func TestNoteDateValidation(t *testing.T) {
	for _, date := range []string{"2026-10-02", "2026-10-02T23:55:42+08:00", "2026-10-02T15:55:42Z", "2026-10-02T15:55:42.123Z"} {
		t.Run(date, func(t *testing.T) {
			if _, err := Parse("date.md", "---\ndate: "+date+"\n---\nBody", "date"); err != nil {
				t.Fatalf("valid date rejected: %v", err)
			}
		})
	}
	for _, date := range []string{"", "yesterday", "2026-02-30", "2026-10-02T23:55:42", "2026-10-02 23:55"} {
		t.Run("invalid-"+date, func(t *testing.T) {
			if _, err := Parse("date.md", "---\ndate: \""+date+"\"\n---\nBody", "date"); err == nil || !strings.Contains(err.Error(), "date") {
				t.Fatalf("invalid date %q accepted or wrong error: %v", date, err)
			}
		})
	}
	if _, err := ParseMemo("draft.md", "---\ndate: invalid\nlang: invalid\ndraft: true\n---\nBody", "draft"); err != nil {
		t.Fatalf("draft should skip publication validation: %v", err)
	}
}

func TestLoadMemosPreservesPathsLanguagesAndLocation(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "旅行"), 0755); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"旅行/河边.md":   "---\ndate: 2026-10-02T23:55:00+08:00\nlocation: 上海\n---\n河边散步。",
		"evening.md": "---\ndate: 2026-10-02T17:00:00Z\nlang: en_US\n---\nAn evening walk.",
		"draft.md":   "---\ndraft: true\n---\nNot published.",
		"bad.md":     "---\ndate: invalid\n---\nSkipped.",
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
	}
	groups, skipped, err := LoadMemos(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || len(skipped) != 1 || !strings.Contains(skipped[0], "bad.md") {
		t.Fatalf("groups = %d, skipped = %v", len(groups), skipped)
	}
	first, _ := groups[0].SelectVersion("en_US")
	if first.Title != "evening" || first.URL != "/en_US/memos/evening/" || first.CanonicalPath != first.URL {
		t.Fatalf("newest memo = %+v", first)
	}
	second, _ := groups[1].SelectVersion("zh_CN")
	if second.Title != "河边" || second.Slug != "旅行/河边" || second.URL != "/memos/旅行/河边/" || second.Section != "memos" || second.Location != "上海" {
		t.Fatalf("nested memo = %+v", second)
	}
}

func TestMissingContentDirectoriesAreEmpty(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	for _, load := range []func(string) ([]*ArticleGroup, []string, error){LoadNotes, LoadMemos} {
		groups, skipped, err := load(missing)
		if err != nil || len(groups) != 0 || len(skipped) != 0 {
			t.Fatalf("missing directory: groups = %v, skipped = %v, err = %v", groups, skipped, err)
		}
	}
}

func TestCompareDatesUsesInstants(t *testing.T) {
	if CompareDates("2026-10-02T23:55:00+08:00", "2026-10-02T17:00:00Z") >= 0 {
		t.Fatal("date ordering ignored timezone offsets")
	}
	if CompareDates("2026-10-02T23:55:00+08:00", "2026-10-02T15:55:00Z") != 0 {
		t.Fatal("equivalent publication instants differ")
	}
}

func TestParseNoteRequiresFrontmatter(t *testing.T) {
	_, err := Parse("missing.md", "没有 frontmatter 的正文", "missing")
	if err == nil {
		t.Fatal("Parse returned nil error")
	}
}

func TestEnglishNoteKeepsCanonicalLanguagePath(t *testing.T) {
	note, err := Parse("shared.md", "---\ntitle: English\ndate: 2026-01-01\nlang: en_US\n---\nEnglish content", "shared")
	if err != nil {
		t.Fatal(err)
	}
	if note.URL != "/en_US/notes/shared/" || note.CanonicalPath != note.URL {
		t.Fatalf("English canonical paths = %q, %q", note.URL, note.CanonicalPath)
	}
}

func TestParseDraftNote(t *testing.T) {
	text := `---
draft: true
---
这里是笔记正文。`
	note, err := Parse("draft.md", text, "draft")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if !note.Draft {
		t.Fatalf("Draft = %v, want true", note.Draft)
	}
	if note.WordCount != 0 {
		t.Fatalf("WordCount = %d, want 0 for draft", note.WordCount)
	}
}
