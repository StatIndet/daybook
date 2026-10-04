package og

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"html/template"
	"net/url"
	"strings"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/embedded"
	"github.com/rivo/uniseg"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	goldmarkhtml "github.com/yuin/goldmark/renderer/html"
	"golang.org/x/net/html"
)

// Card is a standalone, script-free HTML document and its public PNG path.
// PageURL supplies the base URL for resolving relative content images.
type Card struct {
	Section     string `json:"section"`
	PageURL     string `json:"pageURL"`
	OutputPath  string `json:"outputPath"`
	HTML        string `json:"html"`
	Description string `json:"description"`
}

type cardImage struct {
	Source string
	Alt    string
	More   int
}

type cardData struct {
	Lang, SiteName, Title, Summary, Body string
	Author, Initial, Avatar              string
	Date, Updated, ReadingTime           string
	Tags                                 []string
	Images                               []cardImage
}

// ImagePath uses only ASCII and a digest of the section and page route. The
// route includes the language prefix, so translations cannot overwrite one
// another, even when filenames contain non-ASCII or filesystem special chars.
func ImagePath(section, pageURL string) string {
	if section != "memos" {
		section = "notes"
	}
	digest := sha256.Sum256([]byte(section + "\x00" + pageURL))
	return fmt.Sprintf("/generated/og/%s/%x.png", section, digest[:16])
}

// NewCard prepares the content separately from the site's interactive page
// templates. renderedHTML must be the rendered article body, before memo feed
// truncation, so hidden overflow pictures are still counted correctly.
func NewCard(note content.Note, renderedHTML string, cfg config.Config, tags []string) (Card, error) {
	section := note.Section
	if section == "" {
		section = "notes"
	}
	if section != "notes" && section != "memos" {
		return Card{}, fmt.Errorf("OG card %s: unsupported section %q", note.URL, section)
	}
	body, images, err := extractContent(renderedHTML)
	if err != nil {
		return Card{}, fmt.Errorf("OG card %s: parse body: %w", note.URL, err)
	}
	text := strings.Join(strings.Fields(body), " ")
	if section == "notes" && strings.TrimSpace(note.Summary) != "" {
		// Render Markdown to an intermediate document, then collect text only.
		// Raw HTML is never inserted into the screenshot document.
		var summary bytes.Buffer
		md := goldmark.New(goldmark.WithExtensions(extension.GFM), goldmark.WithRendererOptions(goldmarkhtml.WithUnsafe()))
		if err := md.Convert([]byte(note.Summary), &summary); err != nil {
			return Card{}, fmt.Errorf("OG card %s: parse summary: %w", note.URL, err)
		}
		cleaned, _, err := extractContent(summary.String())
		if err != nil {
			return Card{}, fmt.Errorf("OG card %s: clean summary: %w", note.URL, err)
		}
		if cleaned != "" {
			text = strings.Join(strings.Fields(cleaned), " ")
		}
	}

	author := strings.TrimSpace(cfg.Profile.Author.Name)
	if (note.Lang == "en_US" || author == "") && strings.TrimSpace(cfg.Profile.Author.NameEn) != "" {
		author = strings.TrimSpace(cfg.Profile.Author.NameEn)
	}
	if author == "" {
		author = cfg.GetSiteName(note.Lang)
	}
	initial := uniseg.NewGraphemes(author)
	initial.Next()
	data := cardData{
		Lang: "zh-CN", SiteName: truncateText(cfg.GetSiteName(note.Lang), 48),
		Title: truncateText(note.Title, 130), Summary: truncateText(text, 280),
		Body: truncateText(body, 360), Author: truncateText(author, 48),
		Initial: initial.Str(), Avatar: safeImageSource(cfg.Profile.Author.Avatar),
		Date: displayDate(note.Date), Updated: displayDate(note.Updated), Tags: displayTags(tags),
	}
	minutes := note.ReadingMinutes
	if minutes < 1 {
		minutes = 1
	}
	data.ReadingTime = fmt.Sprintf("%d min read", minutes)
	if note.Lang == "en_US" {
		data.Lang = "en-US"
	}
	templateName := "note.html"
	if section == "memos" {
		templateName = "memo.html"
		data.Images = images
		if len(images) > 0 {
			data.Body = truncateText(body, 160)
		}
	}
	tmpl, err := template.ParseFS(embedded.FS, "templates/og/"+templateName)
	if err != nil {
		return Card{}, fmt.Errorf("OG card %s: load template: %w", note.URL, err)
	}
	var output bytes.Buffer
	if err := tmpl.ExecuteTemplate(&output, templateName, data); err != nil {
		return Card{}, fmt.Errorf("OG card %s: render template: %w", note.URL, err)
	}
	return Card{
		Section: section, PageURL: (&url.URL{Path: note.URL}).EscapedPath(), OutputPath: ImagePath(section, note.URL),
		HTML: output.String(), Description: truncateText(text, 240),
	}, nil
}

func displayTags(tags []string) []string {
	result := make([]string, 0, 3)
	for _, tag := range tags {
		if tag = strings.Join(strings.Fields(tag), " "); tag != "" {
			result = append(result, truncateText(tag, 24))
			if len(result) == 3 {
				break
			}
		}
	}
	return result
}

func displayDate(value string) string {
	date, err := content.ParseDate(value)
	if err != nil {
		return ""
	}
	return date.Format("2006-01-02")
}

// Grapheme boundaries preserve Chinese, combining marks, and emoji sequences.
func truncateText(text string, limit int) string {
	text = strings.TrimSpace(text)
	graphemes := uniseg.NewGraphemes(text)
	end := 0
	for i := 0; graphemes.Next(); i++ {
		if i == limit {
			return strings.TrimSpace(text[:end]) + "…"
		}
		_, end = graphemes.Positions()
	}
	return text
}

func safeImageSource(source string) string {
	source = strings.TrimSpace(source)
	parsed, err := url.Parse(source)
	if err != nil || source == "" || (parsed.Scheme != "" && parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return source
}

func extractContent(source string) (string, []cardImage, error) {
	root, err := html.Parse(strings.NewReader(source))
	if err != nil {
		return "", nil, err
	}
	var text strings.Builder
	var images []cardImage
	imageCount := 0
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			if ignoreElement(node) {
				return
			}
			if node.Data == "img" {
				if source := safeImageSource(attribute(node, "src")); source != "" {
					imageCount++
					if len(images) < 4 {
						images = append(images, cardImage{Source: source, Alt: attribute(node, "alt")})
					}
				}
				return
			}
			if blockElement(node.Data) {
				text.WriteByte('\n')
			}
		}
		if node.Type == html.TextNode {
			text.WriteString(node.Data)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
		if node.Type == html.ElementNode && blockElement(node.Data) {
			text.WriteByte('\n')
		}
	}
	walk(root)
	if imageCount > 4 {
		images[3].More = imageCount - 4
	}
	var lines []string
	for _, line := range strings.Split(text.String(), "\n") {
		if line = strings.Join(strings.Fields(line), " "); line != "" {
			lines = append(lines, line)
		}
	}
	return strings.Join(lines, "\n"), images, nil
}

func attribute(node *html.Node, key string) string {
	for _, attr := range node.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func ignoreElement(node *html.Node) bool {
	switch node.Data {
	case "head", "script", "style", "template", "noscript", "button", "input", "select", "textarea", "svg", "iframe", "audio", "video":
		return true
	}
	if attribute(node, "aria-hidden") == "true" {
		return true
	}
	for _, attr := range node.Attr {
		if attr.Key == "hidden" {
			return true
		}
	}
	for _, class := range strings.Fields(attribute(node, "class")) {
		switch class {
		case "material-symbol", "memo-actions", "article-actions", "memo-more-photos", "heading-anchor", "code-language", "code-copy-button", "mermaid", "mermaid-block", "mermaid-source":
			return true
		}
	}
	return false
}

func blockElement(tag string) bool {
	switch tag {
	case "p", "div", "section", "article", "header", "footer", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre", "br", "hr", "tr", "td", "th", "figcaption":
		return true
	}
	return false
}
