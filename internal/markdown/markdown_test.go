package markdown

import (
	"os/exec"
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
	document, err := ToHTMLWithHeadings("~~old~~\n\n- [x] done\n- [ ] todo\n\n| A | B |\n| --- | --- |\n| **strong** | ~~deleted~~ |\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		"<del>old</del>",
		`<input checked="" disabled="" type="checkbox"> done`,
		`<input disabled="" type="checkbox"> todo`,
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

func TestToHTMLWithNestedTaskList(t *testing.T) {
	document, err := ToHTMLWithHeadings("- [ ] parent\n  - [ ] child\n    - [x] grandchild\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`<li><input disabled="" type="checkbox"> parent`,
		`<ul>`,
		`<li><input disabled="" type="checkbox"> child`,
		`<li><input checked="" disabled="" type="checkbox"> grandchild</li>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithFigureCaptions(t *testing.T) {
	document, err := ToHTMLWithHeadings("![A caption](/images/example.webp)\n\n![_Hidden caption](/images/hidden.webp)\n\n![](/images/plain.webp)\n\nText ![inline](/images/inline.webp) image.\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`<figure><img src="/images/example.webp" alt="A caption" loading="lazy" decoding="async"><figcaption>A caption</figcaption></figure>`,
		`<p><img src="/images/hidden.webp" alt="Hidden caption" loading="lazy" decoding="async"></p>`,
		`<p><img src="/images/plain.webp" alt="" loading="lazy" decoding="async"></p>`,
		`<p>Text <img src="/images/inline.webp" alt="inline"> image.</p>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithGitHubAlerts(t *testing.T) {
	document, err := ToHTMLWithHeadings("> [!WARNING]\n> **Careful** with this.\n> - List item\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`<div class="admonition admonition-warning">`,
		`<div class="admonition-title">Warning</div>`,
		`<strong>Careful</strong>`,
		`<li>List item</li>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithContainerDirectives(t *testing.T) {
	input := strings.Join([]string{
		":::note[Custom Title]",
		"Body with **markdown**.",
		":::",
		"",
		":::fold[More]",
		"- hidden item",
		":::",
		"",
		":::gallery",
		"![One](/images/one.webp)",
		"![Two](/images/two.webp)",
		":::",
	}, "\n")

	document, err := ToHTMLWithHeadings(input)
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`<div class="admonition admonition-note">`,
		`<div class="admonition-title">Custom Title</div>`,
		`Body with <strong>markdown</strong>.`,
		`<details class="md-fold"><summary>More</summary>`,
		`<li>hidden item</li>`,
		`<div class="md-gallery">`,
		`<figure><img src="/images/one.webp" alt="One" loading="lazy" decoding="async"><figcaption>One</figcaption></figure>`,
		`<figure><img src="/images/two.webp" alt="Two" loading="lazy" decoding="async"><figcaption>Two</figcaption></figure>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithLeafEmbeds(t *testing.T) {
	input := strings.Join([]string{
		`::github{repo="StatIndet/daybook"}`,
		`::youtube{id="9pP0pIgP2kE"}`,
		`::bilibili{id="BV1sK4y1Z7KG"}`,
		`::spotify{url="https://open.spotify.com/track/0HYAsQwJIO6FLqpyTeD3l6"}`,
		`::codepen{url="https://codepen.io/jh3y/pen/NWdNMBJ"}`,
		`::netease{type="song" id="28310930"}`,
		`::tweet{url="https://x.com/hachi_08/status/1906456524337123549"}`,
	}, "\n\n")

	document, err := ToHTMLWithHeadings(input)
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`class="no-heti gc-container"`,
		`href="https://github.com/StatIndet/daybook"`,
		`youtube-nocookie.com/embed/9pP0pIgP2kE`,
		`player.bilibili.com/player.html?`,
		`bvid=BV1sK4y1Z7KG`,
		`open.spotify.com/embed/track/0HYAsQwJIO6FLqpyTeD3l6`,
		`codepen.io/jh3y/embed/NWdNMBJ?default-tab=result`,
		`class="netease-custom-player"`,
		`data-id="28310930"`,
		`class="twitter-tweet"`,
		`status/1906456524337123549`,
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

	wantParts := []string{
		`<div class="highlight"><button class="code-copy-button" type="button" aria-label="复制代码">`,
		`<span class="material-symbol" aria-hidden="true">content_copy</span>`,
		`<pre tabindex="0" class="chroma">`,
		`<code>`,
		`class="kd"`,
		`class="nf"`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
}

func TestToHTMLWithPlainCodeFallback(t *testing.T) {
	document, err := ToHTMLWithHeadings("```moo\nplain <code> & text\n```\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	wantParts := []string{
		`<div class="highlight is-plain"><button class="code-copy-button" type="button" aria-label="复制代码">`,
		`<span class="material-symbol" aria-hidden="true">content_copy</span>`,
		`<pre tabindex="0"><code class="language-moo" data-lang="moo">`,
		`plain &lt;code&gt; &amp; text`,
		`</code></pre></div>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
	if strings.Contains(document.HTML, "<code> & text") {
		t.Fatalf("HTML did not escape plain code fallback: %s", document.HTML)
	}
	if document.HasMermaid {
		t.Fatal("plain code block should not set HasMermaid")
	}
}

func TestToHTMLWithMermaidCodeBlock(t *testing.T) {
	document, err := ToHTMLWithHeadings("```mermaid\ngraph TD\nA --> B\n```\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !document.HasMermaid {
		t.Fatal("Mermaid code block should set HasMermaid")
	}
	wantParts := []string{
		`<div class="mermaid-block" data-mermaid-status="pending">`,
		`<pre class="mermaid-source"><code>graph TD`,
		`A --&gt; B`,
		`<div class="mermaid-diagram" aria-hidden="true"></div>`,
		`<p class="mermaid-error" hidden></p>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(document.HTML, part) {
			t.Fatalf("HTML does not contain %q: %s", part, document.HTML)
		}
	}
	for _, forbidden := range []string{`language-mermaid`, `<div class="highlight"`} {
		if strings.Contains(document.HTML, forbidden) {
			t.Fatalf("Mermaid block should not be rendered as highlighted code containing %q: %s", forbidden, document.HTML)
		}
	}
}

func TestToHTMLWithEmptyMermaidCodeBlock(t *testing.T) {
	document, err := ToHTMLWithHeadings("```mermaid\n```\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !document.HasMermaid {
		t.Fatal("empty Mermaid code block should still set HasMermaid")
	}
	if !strings.Contains(document.HTML, `<div class="mermaid-block"`) {
		t.Fatalf("HTML does not contain Mermaid fallback container: %s", document.HTML)
	}
}

func TestToHTMLWithNoLanguageCodeFallback(t *testing.T) {
	document, err := ToHTMLWithHeadings("```\nplain text\n```\n")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !strings.Contains(document.HTML, `<pre tabindex="0"><code>plain text`) {
		t.Fatalf("HTML does not contain highlighted code classes: %s", document.HTML)
	}
	if document.HasMermaid {
		t.Fatal("no-language code block should not set HasMermaid")
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

func TestToHTMLWithMath(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed, skipping KaTeX SSR test")
	}

	document, err := ToHTMLWithHeadings("Some math $x = 1$ inline.\n\n$$\ny = 2\n$$\n\nAnother paragraph.")
	if err != nil {
		t.Fatalf("ToHTMLWithHeadings returned error: %v", err)
	}

	if !strings.Contains(document.HTML, `<span class="katex">`) {
		t.Fatalf("HTML does not contain rendered inline math: %s", document.HTML)
	}
	if !strings.Contains(document.HTML, `<span class="katex-display">`) {
		t.Fatalf("HTML does not contain rendered display math: %s", document.HTML)
	}

	if strings.Contains(document.HTML, `<p><span class="katex-display">`) || strings.Contains(document.HTML, `<p><div class="katex-display">`) {
		t.Fatalf("Display math should not be wrapped in <p> tag: %s", document.HTML)
	}
}
