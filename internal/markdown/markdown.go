package markdown

import (
	"bytes"
	"fmt"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	gmtext "github.com/yuin/goldmark/text"
)

type Heading struct {
	Level int
	Text  string
	ID    string
}

type Document struct {
	HTML     string
	Headings []Heading
}

func ToHTML(text string) (string, error) {
	document, err := ToHTMLWithHeadings(text)
	if err != nil {
		return "", err
	}

	return document.HTML, nil
}

func ToHTMLWithHeadings(input string) (Document, error) {
	source := []byte(input)
	markdown := goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			extension.Footnote,
			highlighting.NewHighlighting(
				highlighting.WithStyle("github"),
				highlighting.WithFormatOptions(chromahtml.WithClasses(true)),
			),
		),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
	)

	root := markdown.Parser().Parse(gmtext.NewReader(source))
	headings := collectHeadings(root, source)

	var output bytes.Buffer
	if err := markdown.Renderer().Render(&output, source, root); err != nil {
		return Document{}, fmt.Errorf("转换 Markdown: %w", err)
	}

	return Document{
		HTML:     output.String(),
		Headings: headings,
	}, nil
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
