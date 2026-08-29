package markdown

import (
	"bytes"
	"fmt"
	stdhtml "html"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	gmtext "github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

type Heading struct {
	Level int
	Text  string
	ID    string
}

type Document struct {
	HTML       string
	Headings   []Heading
	HasMermaid bool
}

func ToHTML(text string) (string, error) {
	document, err := ToHTMLWithHeadings(text)
	if err != nil {
		return "", err
	}

	return document.HTML, nil
}

func ToHTMLWithHeadings(input string) (Document, error) {
	renderer := newRenderer()
	return renderer.render(input, true, 0)
}

type markdownRenderer struct {
	markdown goldmark.Markdown
}

type sanitizeHTMLRenderer struct {
	policy *bluemonday.Policy
}

func (r *sanitizeHTMLRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(ast.KindHTMLBlock, r.renderHTMLBlock)
	reg.Register(ast.KindRawHTML, r.renderRawHTML)
}

func (r *sanitizeHTMLRenderer) renderHTMLBlock(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	var buf bytes.Buffer
	for i := 0; i < node.Lines().Len(); i++ {
		line := node.Lines().At(i)
		buf.Write(line.Value(source))
	}
	sanitized := r.policy.SanitizeBytes(buf.Bytes())
	w.Write(sanitized)
	return ast.WalkContinue, nil
}

func (r *sanitizeHTMLRenderer) renderRawHTML(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.RawHTML)
	var buf bytes.Buffer
	for i := 0; i < n.Segments.Len(); i++ {
		segment := n.Segments.At(i)
		buf.Write(segment.Value(source))
	}
	sanitized := r.policy.SanitizeBytes(buf.Bytes())
	w.Write(sanitized)
	return ast.WalkContinue, nil
}

type sanitizerExtension struct {
	policy *bluemonday.Policy
}

func (e *sanitizerExtension) Extend(m goldmark.Markdown) {
	m.Renderer().AddOptions(renderer.WithNodeRenderers(
		util.Prioritized(&sanitizeHTMLRenderer{policy: e.policy}, 0),
	))
}

func newRenderer() markdownRenderer {
	p := bluemonday.UGCPolicy()
	p.AllowElements("details", "summary", "kbd", "figure", "figcaption", "picture", "source", "mark")
	p.AllowAttrs("class", "id", "width", "height", "align", "colspan", "rowspan", "loading", "style").Globally()
	p.AllowAttrs("target").OnElements("a")
	p.AllowAttrs("rel").OnElements("a")
	p.RequireNoFollowOnLinks(false)
	p.AllowDataURIImages()

	return markdownRenderer{
		markdown: goldmark.New(
			goldmark.WithExtensions(
				extension.Table,
				extension.Strikethrough,
				extension.Linkify,
				extension.TaskList,
				extension.Footnote,
				ObsidianExtension,
				highlighting.NewHighlighting(
					highlighting.WithStyle("github"),
					highlighting.WithFormatOptions(
						chromahtml.WithClasses(true),
						chromahtml.WithPreWrapper(codeBlockPreWrapper{}),
					),
					highlighting.WithWrapperRenderer(renderCodeBlockWrapper),
				),
				&sanitizerExtension{policy: p},
			),
			goldmark.WithParserOptions(parser.WithAutoHeadingID()),
			goldmark.WithRendererOptions(html.WithUnsafe()),
		),
	}
}

func (renderer markdownRenderer) render(input string, includeHeadings bool, depth int) (Document, error) {
	processed, replacements, hasMermaid, err := renderer.processExtensions(input, depth)
	if err != nil {
		return Document{}, err
	}

	source := []byte(processed)
	root := renderer.markdown.Parser().Parse(gmtext.NewReader(source))

	processedHeadings := processHeadings(root, source)
	var headings []Heading
	if includeHeadings {
		headings = processedHeadings
	}

	var output bytes.Buffer
	if err := renderer.markdown.Renderer().Render(&output, source, root); err != nil {
		return Document{}, fmt.Errorf("转换 Markdown: %w", err)
	}

	html := applyFigureCaptions(output.String())
	html = restoreHTMLReplacements(html, replacements)

	return Document{
		HTML:       html,
		Headings:   headings,
		HasMermaid: hasMermaid,
	}, nil
}

func (renderer markdownRenderer) renderFragment(input string, depth int) (string, error) {
	document, err := renderer.render(input, false, depth)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(document.HTML), nil
}

func processHeadings(root ast.Node, source []byte) []Heading {
	var headings []Heading
	usedIDs := make(map[string]int)

	_ = ast.Walk(root, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || node.Kind() != ast.KindHeading {
			return ast.WalkContinue, nil
		}

		heading := node.(*ast.Heading)
		if heading.Level > 4 {
			return ast.WalkContinue, nil
		}

		text := strings.TrimSpace(string(heading.Text(source)))
		if text == "" {
			return ast.WalkContinue, nil
		}

		baseID := generateHeadingID(text, heading.Level)
		id := baseID

		count := usedIDs[id]
		if count > 0 {
			for {
				count++
				candidate := fmt.Sprintf("%s-%d", baseID, count)
				if usedIDs[candidate] == 0 {
					id = candidate
					usedIDs[baseID] = count
					break
				}
			}
		}
		usedIDs[id] = 1

		heading.SetAttributeString("id", []byte(id))

		// TOC only includes H2-H4
		if heading.Level >= 2 && heading.Level <= 4 {
			headings = append(headings, Heading{
				Level: heading.Level,
				Text:  text,
				ID:    id,
			})
		}

		return ast.WalkContinue, nil
	})

	return headings
}

func generateHeadingID(text string, level int) string {
	var b strings.Builder
	var lastIsSpace bool

	for _, r := range text {
		if r < 32 || r == 127 {
			continue
		}

		if r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\u00A0' || r == '\u3000' {
			if !lastIsSpace {
				b.WriteRune('-')
				lastIsSpace = true
			}
		} else {
			b.WriteRune(r)
			lastIsSpace = false
		}
	}

	res := strings.Trim(b.String(), "-")
	if res == "" {
		res = "section"
	}

	prefix := ""
	for i := 1; i < level; i++ {
		prefix += "#"
	}

	return prefix + res
}

type codeBlockPreWrapper struct{}

func (codeBlockPreWrapper) Start(code bool, _ string) string {
	if code {
		return `<pre tabindex="0" class="chroma"><code>`
	}

	return `<pre tabindex="0">`
}

func (codeBlockPreWrapper) End(code bool) string {
	if code {
		return `</code></pre>`
	}

	return `</pre>`
}

func renderCodeBlockWrapper(w util.BufWriter, context highlighting.CodeBlockContext, entering bool) {
	if entering {
		if context.Highlighted() {
			_, _ = w.WriteString(`<div class="highlight">`)
			writeCopyButton(w)
			return
		}

		_, _ = w.WriteString(`<div class="highlight is-plain">`)
		writeCopyButton(w)
		_, _ = w.WriteString(`<pre tabindex="0"><code`)
		if language, ok := context.Language(); ok && len(language) > 0 {
			escapedLanguage := stdhtml.EscapeString(string(language))
			_, _ = w.WriteString(` class="language-`)
			_, _ = w.WriteString(escapedLanguage)
			_, _ = w.WriteString(`" data-lang="`)
			_, _ = w.WriteString(escapedLanguage)
			_, _ = w.WriteString(`"`)
		}
		_, _ = w.WriteString(`>`)
		return
	}

	if context.Highlighted() {
		_, _ = w.WriteString(`</div>`)
		return
	}

	_, _ = w.WriteString(`</code></pre></div>`)
}

func writeCopyButton(w util.BufWriter) {
	_, _ = w.WriteString(`<button class="code-copy-button" type="button" aria-label="复制代码">`)
	_, _ = w.WriteString(`<span class="material-symbol" aria-hidden="true">content_copy</span>`)
	_, _ = w.WriteString(`</button>`)
}
