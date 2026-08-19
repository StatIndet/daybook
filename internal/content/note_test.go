package content

import "testing"

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

	if note.Title != "示例笔记" {
		t.Fatalf("Title = %q, want %q", note.Title, "示例笔记")
	}
	if note.URL != "/notes/example/" {
		t.Fatalf("URL = %q, want %q", note.URL, "/notes/example/")
	}
	if len(note.Tags) != 2 {
		t.Fatalf("Tags length = %d, want 2", len(note.Tags))
	}
}

func TestParseNoteRequiresFrontmatter(t *testing.T) {
	_, err := Parse("missing.md", "没有 frontmatter 的正文", "missing")
	if err == nil {
		t.Fatal("Parse returned nil error")
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
