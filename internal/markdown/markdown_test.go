package markdown

import (
	"strings"
	"testing"
)

func TestToHTMLWithHeadings(t *testing.T) {
	document, err := ToHTMLWithHeadings("## First Heading\n\nText.\n\n### Second Heading\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if len(document.Headings) != 2 {
		t.Fatalf("Headings length = %d, want 2", len(document.Headings))
	}
	if document.Headings[0].Level != 2 || document.Headings[0].Text != "First Heading" || document.Headings[0].ID == "" {
		t.Fatalf("first heading = %#v, want level 2 with text and id", document.Headings[0])
	}
	if !strings.Contains(document.HTML, `id="`+document.Headings[0].ID+`"`) {
		t.Fatalf("HTML does not contain first heading id %q: %s", document.Headings[0].ID, document.HTML)
	}
}

func TestToHTMLWithGFM(t *testing.T) {
	document, err := ToHTMLWithHeadings("~~old~~\n\n- [x] done\n\n| A | B |\n| --- | --- |\n| **strong** | ~~deleted~~ |\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		"<del>old</del>",
		`type="checkbox"`,
		"<table>",
		"<strong>strong</strong>",
		"<del>deleted</del>",
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithFootnote(t *testing.T) {
	document, err := ToHTMLWithHeadings("A note.[^a]\n\n[^a]: Footnote text.\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !strings.Contains(document.HTML, `class="footnotes"`) || !strings.Contains(document.HTML, "Footnote text") {
		t.Fatalf("HTML does not contain rendered footnote: %s", document.HTML)
	}
}

func TestToHTMLWithHighlightedCode(t *testing.T) {
	document, err := ToHTMLWithHeadings("```go\nfunc main() {}\n```\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !strings.Contains(document.HTML, `class="chroma`) || !strings.Contains(document.HTML, `class="kd"`) {
		t.Fatalf("HTML does not contain highlighted code classes: %s", document.HTML)
	}
}

func TestToHTMLDoesNotRenderUnsafeHTML(t *testing.T) {
	document, err := ToHTMLWithHeadings("<script>alert(1)</script>\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if strings.Contains(document.HTML, "<script>") {
		t.Fatalf("HTML rendered unsafe script tag: %s", document.HTML)
	}
}
