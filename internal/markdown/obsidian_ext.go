package markdown

import (
	"bytes"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// --- Highlighter (==...==) ---

type HighlightNode struct {
	ast.BaseInline
}

var KindHighlight = ast.NewNodeKind("Highlight")

func (n *HighlightNode) Kind() ast.NodeKind { return KindHighlight }
func (n *HighlightNode) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, nil, nil)
}

type highlightDelimiterProcessor struct{}

func (p *highlightDelimiterProcessor) IsDelimiter(b byte) bool { return b == '=' }
func (p *highlightDelimiterProcessor) CanOpenCloser(opener, closer *parser.Delimiter) bool {
	return opener.Char == closer.Char
}
func (p *highlightDelimiterProcessor) OnMatch(consumes int) ast.Node {
	return &HighlightNode{}
}

var defaultHighlightDelimiterProcessor = &highlightDelimiterProcessor{}

type highlightParser struct{}

func (p *highlightParser) Trigger() []byte { return []byte{'='} }
func (p *highlightParser) Parse(parent ast.Node, block text.Reader, pc parser.Context) ast.Node {
	before := block.PrecendingCharacter()
	line, segment := block.PeekLine()
	node := parser.ScanDelimiter(line, before, 2, defaultHighlightDelimiterProcessor)
	if node == nil || node.OriginalLength > 2 || before == '=' {
		return nil
	}

	node.Segment = segment.WithStop(segment.Start + node.OriginalLength)
	block.Advance(node.OriginalLength)
	pc.PushDelimiter(node)
	return node
}

// --- Inline Comment (%%...%%) ---

type CommentInlineNode struct {
	ast.BaseInline
}

var KindCommentInline = ast.NewNodeKind("CommentInline")

func (n *CommentInlineNode) Kind() ast.NodeKind { return KindCommentInline }
func (n *CommentInlineNode) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, nil, nil)
}

type commentDelimiterProcessor struct{}

func (p *commentDelimiterProcessor) IsDelimiter(b byte) bool { return b == '%' }
func (p *commentDelimiterProcessor) CanOpenCloser(opener, closer *parser.Delimiter) bool {
	return opener.Char == closer.Char
}
func (p *commentDelimiterProcessor) OnMatch(consumes int) ast.Node {
	return &CommentInlineNode{}
}

var defaultCommentDelimiterProcessor = &commentDelimiterProcessor{}

type commentInlineParser struct{}

func (p *commentInlineParser) Trigger() []byte { return []byte{'%'} }
func (p *commentInlineParser) Parse(parent ast.Node, block text.Reader, pc parser.Context) ast.Node {
	before := block.PrecendingCharacter()
	line, segment := block.PeekLine()
	node := parser.ScanDelimiter(line, before, 2, defaultCommentDelimiterProcessor)
	if node == nil || node.OriginalLength > 2 || before == '%' {
		return nil
	}

	node.Segment = segment.WithStop(segment.Start + node.OriginalLength)
	block.Advance(node.OriginalLength)
	pc.PushDelimiter(node)
	return node
}

// --- Block Comment (%%...%%) ---

type CommentBlockNode struct {
	ast.BaseBlock
}

var KindCommentBlock = ast.NewNodeKind("CommentBlock")

func (n *CommentBlockNode) Kind() ast.NodeKind { return KindCommentBlock }
func (n *CommentBlockNode) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, nil, nil)
}

type commentBlockParser struct{}

func (b *commentBlockParser) Trigger() []byte { return []byte{'%'} }

func (b *commentBlockParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, _ := reader.PeekLine()
	pos := pc.BlockOffset()
	if pos < 0 || pos >= len(line) {
		return nil, parser.NoChildren
	}

	// Must start with %%
	if line[pos] == '%' && pos+1 < len(line) && line[pos+1] == '%' {
		node := &CommentBlockNode{}
		if bytes.Contains(line[pos+2:], []byte("%%")) {
			node.SetAttribute([]byte("closed"), []byte("true"))
		}
		return node, parser.NoChildren
	}
	return nil, parser.NoChildren
}

func (b *commentBlockParser) Continue(node ast.Node, reader text.Reader, pc parser.Context) parser.State {
	if _, has := node.Attribute([]byte("closed")); has {
		return parser.Close
	}
	line, _ := reader.PeekLine()
	if bytes.Contains(line, []byte("%%")) {
		reader.Advance(len(line))
		return parser.Close
	}
	return parser.Continue
}

func (b *commentBlockParser) Close(node ast.Node, reader text.Reader, pc parser.Context) {}
func (b *commentBlockParser) CanInterruptParagraph() bool { return true }
func (b *commentBlockParser) CanAcceptIndentedLine() bool { return false }

// --- Renderer ---

type obsidianRenderer struct {
	html.Config
}

func (r *obsidianRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(KindHighlight, r.renderHighlight)
	reg.Register(KindCommentInline, r.renderComment)
	reg.Register(KindCommentBlock, r.renderComment)
}

func (r *obsidianRenderer) renderHighlight(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		w.WriteString("<mark>")
	} else {
		w.WriteString("</mark>")
	}
	return ast.WalkContinue, nil
}

func (r *obsidianRenderer) renderComment(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	return ast.WalkSkipChildren, nil
}

// --- AST Transformer (Remove Empty Paragraphs caused by comments) ---

type emptyParagraphTransformer struct{}

func (t *emptyParagraphTransformer) Transform(node *ast.Document, reader text.Reader, pc parser.Context) {
	var toRemove []ast.Node

	ast.Walk(node, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if n.Kind() == ast.KindParagraph {
			isEmpty := true
			for c := n.FirstChild(); c != nil; c = c.NextSibling() {
				if c.Kind() == KindCommentInline {
					continue
				}
				if textNode, ok := c.(*ast.Text); ok {
					segment := textNode.Segment
					val := segment.Value(reader.Source())
					if len(bytes.TrimSpace(val)) == 0 {
						continue
					}
				}
				isEmpty = false
				break
			}
			if isEmpty {
				toRemove = append(toRemove, n)
			}
		}
		return ast.WalkContinue, nil
	})

	for _, n := range toRemove {
		if n.Parent() != nil {
			n.Parent().RemoveChild(n.Parent(), n)
		}
	}
}

// --- Extension Registration ---

type obsidianExtension struct{}

func (e *obsidianExtension) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(
		parser.WithBlockParsers(
			util.Prioritized(&commentBlockParser{}, 100),
		),
		parser.WithInlineParsers(
			util.Prioritized(&highlightParser{}, 500),
			util.Prioritized(&commentInlineParser{}, 500),
		),
		parser.WithASTTransformers(
			util.Prioritized(&emptyParagraphTransformer{}, 1000),
		),
	)
	m.Renderer().AddOptions(
		renderer.WithNodeRenderers(
			util.Prioritized(&obsidianRenderer{}, 500),
		),
	)
}

var ObsidianExtension = &obsidianExtension{}
