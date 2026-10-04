package graph

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"
	"time"
	"unicode"

	"github.com/StatIndet/daybook/internal/content"
	"golang.org/x/net/html"
)

// SearchDocument contains only public, rendered note text and approved metadata.
// Keeping this separate from graph.json lets ordinary graph visits skip the body
// index until a query actually needs it.
type SearchDocument struct {
	ID         string         `json:"id"`
	Text       string         `json:"text"`
	Lines      []string       `json:"lines"`
	Sections   []string       `json:"sections"`
	Properties map[string]any `json:"properties"`
}

type SearchData struct {
	Version   int              `json:"version"`
	Documents []SearchDocument `json:"documents"`
}

// NewSearchDocument consumes the same sanitized, resolved HTML that is published
// as the article. This excludes hidden Obsidian/HTML comments and frontmatter,
// and treats code containing Markdown heading markers as code, not a section.
func NewSearchDocument(note content.Note, publishedHTML string, allowedProperties []string) SearchDocument {
	lines, sections := searchText(publishedHTML)
	tags := note.Tags
	if tags == nil {
		tags = []string{}
	}
	properties := map[string]any{
		"title": note.Title, "date": note.Date, "updated": note.Updated,
		"tags": tags, "summary": note.Summary, "lang": note.Lang,
		"slug": note.Slug, "pinned": note.Pinned, "section": note.Section,
		"location": note.Location, "url": note.URL, "i18n_key": note.I18nKey,
	}
	for _, key := range allowedProperties {
		key = strings.TrimSpace(key)
		if _, public := properties[strings.ToLower(key)]; public {
			continue // Public values come from the canonical note, never raw YAML.
		}
		if value, exists := note.Frontmatter[key]; exists {
			if value, valid := searchableProperty(value); valid {
				properties[key] = value
			}
		}
	}
	return SearchDocument{
		ID: note.URL, Text: strings.Join(lines, "\n"), Lines: lines,
		Sections: sections, Properties: properties,
	}
}

func searchableProperty(value any) (any, bool) {
	if list, ok := value.([]any); ok {
		result := make([]any, 0, len(list))
		for _, entry := range list {
			entry, valid := searchableScalar(entry)
			if !valid {
				return nil, false
			}
			result = append(result, entry)
		}
		return result, true
	}
	return searchableScalar(value)
}

func searchableScalar(value any) (any, bool) {
	switch value := value.(type) {
	case nil, string, bool, int, int64, uint64:
		return value, true
	case float64:
		return value, !math.IsNaN(value) && !math.IsInf(value, 0)
	case time.Time: // YAML timestamps otherwise become Go structs.
		return value.Format(time.RFC3339), true
	default:
		return nil, false
	}
}

func searchText(publishedHTML string) ([]string, []string) {
	root, err := html.Parse(strings.NewReader(publishedHTML))
	if err != nil {
		return []string{}, []string{}
	}
	var current strings.Builder
	sections := []string{}
	flushSection := func() {
		if section := strings.TrimSpace(current.String()); section != "" {
			sections = append(sections, section)
		}
		current.Reset()
	}
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.TextNode {
			// Goldmark formats table cells on separate HTML source lines, even
			// though they belong to the same Markdown row and line query scope.
			if node.Parent != nil && strings.TrimSpace(node.Data) == "" {
				switch node.Parent.Data {
				case "table", "thead", "tbody", "tfoot", "tr":
					return
				}
			}
			current.WriteString(strings.ReplaceAll(node.Data, "\r", ""))
			return
		}
		if node.Type == html.CommentNode || hiddenSearchNode(node) {
			return
		}
		if searchNodeHasClass(node, "gc-container") {
			for _, attr := range node.Attr {
				if attr.Key == "data-repo" {
					// Index the authored identifier, not the card's loading text,
					// placeholder counters or inaccessible decorative markup.
					current.WriteString("\n" + attr.Val + "\n")
					return
				}
			}
		}
		block := false
		if node.Type == html.ElementNode {
			switch node.Data {
			case "h1", "h2", "h3", "h4", "h5", "h6":
				flushSection()
				block = true
			case "p", "div", "section", "article", "blockquote", "pre", "li", "tr", "dl", "dt", "dd", "figure", "figcaption", "details", "summary", "ul", "ol":
				block = true
			case "br", "hr":
				current.WriteByte('\n')
			case "td", "th":
				current.WriteByte(' ')
			}
		}
		if block {
			current.WriteByte('\n')
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
		if block {
			current.WriteByte('\n')
		}
	}
	visit(root)
	flushSection()
	lines := []string{}
	for i, section := range sections {
		sectionLines := []string{}
		for _, line := range strings.Split(section, "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				sectionLines = append(sectionLines, line)
			}
		}
		sections[i] = strings.Join(sectionLines, "\n")
		lines = append(lines, sectionLines...)
	}
	return lines, sections
}

func hiddenSearchNode(node *html.Node) bool {
	if node.Type != html.ElementNode {
		return false
	}
	switch node.Data {
	case "script", "style", "noscript", "template", "button", "svg":
		return true
	}
	for _, class := range []string{"material-symbol", "music-time", "gc-repo-description", "gc-info-bar", "obsidian-embed-link"} {
		if searchNodeHasClass(node, class) {
			return true
		}
	}
	for _, attr := range node.Attr {
		if attr.Key == "hidden" || attr.Key == "aria-hidden" && strings.EqualFold(attr.Val, "true") {
			return true
		}
		if attr.Key == "style" {
			style := strings.ToLower(strings.Map(func(r rune) rune {
				if unicode.IsSpace(r) {
					return -1
				}
				return r
			}, attr.Val))
			if strings.Contains(style, "display:none") || strings.Contains(style, "visibility:hidden") {
				return true
			}
		}
	}
	return false
}

func searchNodeHasClass(node *html.Node, class string) bool {
	for _, attr := range node.Attr {
		if attr.Key == "class" {
			for _, name := range strings.Fields(attr.Val) {
				if name == class {
					return true
				}
			}
		}
	}
	return false
}

func BuildSearchJSON(documents []SearchDocument, outputPath string) error {
	if documents == nil {
		documents = []SearchDocument{}
	}
	data, err := json.Marshal(SearchData{Version: 1, Documents: documents})
	if err != nil {
		return fmt.Errorf("encode graph-search.json: %w", err)
	}
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("write graph-search.json: %w", err)
	}
	return nil
}
