package markdown

import (
	"bytes"
	"fmt"
	stdhtml "html"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
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

func newRenderer() markdownRenderer {
	return markdownRenderer{
		markdown: goldmark.New(
			goldmark.WithExtensions(
				extension.Table,
				extension.Strikethrough,
				extension.Linkify,
				extension.TaskList,
				extension.Footnote,
				highlighting.NewHighlighting(
					highlighting.WithStyle("github"),
					highlighting.WithFormatOptions(
						chromahtml.WithClasses(true),
						chromahtml.WithPreWrapper(codeBlockPreWrapper{}),
					),
					highlighting.WithWrapperRenderer(renderCodeBlockWrapper),
				),
			),
			goldmark.WithParserOptions(parser.WithAutoHeadingID()),
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
	headings := []Heading{}
	if includeHeadings {
		headings = collectHeadings(root, source)
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

func collectHeadings(root ast.Node, source []byte) []Heading {
	var headings []Heading

	_ = ast.Walk(root, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || node.Kind() != ast.KindHeading {
			return ast.WalkContinue, nil
		}

		heading := node.(*ast.Heading)
		if heading.Level < 2 || heading.Level > 4 {
			return ast.WalkContinue, nil
		}

		text := strings.TrimSpace(string(heading.Text(source)))
		id := headingID(heading)
		if text == "" || id == "" {
			return ast.WalkContinue, nil
		}

		headings = append(headings, Heading{
			Level: heading.Level,
			Text:  text,
			ID:    id,
		})

		return ast.WalkContinue, nil
	})

	return headings
}

func headingID(heading *ast.Heading) string {
	value, ok := heading.AttributeString("id")
	if !ok {
		return ""
	}

	switch id := value.(type) {
	case string:
		return id
	case []byte:
		return string(id)
	default:
		return fmt.Sprint(id)
	}
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
