package content

import "testing"

func TestParsePageAllowsEmptySlug(t *testing.T) {
	text := `---
title: About / 关于
summary: Welcome.
slug:
---

页面正文。`

	page, err := ParsePage("about.md", text)
	if err != nil {
		t.Fatalf("ParsePage returned error: %v", err)
	}

	if page.Title != "About / 关于" {
		t.Fatalf("Title = %q, want %q", page.Title, "About / 关于")
	}
	if page.Summary != "Welcome." {
		t.Fatalf("Summary = %q, want %q", page.Summary, "Welcome.")
	}
	if page.Body != "页面正文。" {
		t.Fatalf("Body = %q, want page body", page.Body)
	}
}

func TestParseDraftPage(t *testing.T) {
	text := `---
draft: true
---
这里是页面正文。`
	page, err := ParsePage("draft.md", text)
	if err != nil {
		t.Fatalf("ParsePage returned error: %v", err)
	}
	if !page.Draft {
		t.Fatalf("Draft = %v, want true", page.Draft)
	}
	if page.WordCount != 0 {
		t.Fatalf("WordCount = %d, want 0 for draft", page.WordCount)
	}
}
