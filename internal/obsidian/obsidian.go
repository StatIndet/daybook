package obsidian

import (
	"fmt"
	stdhtml "html"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

type Target struct {
	Title      string
	Slug       string
	SourcePath string
	Headings   map[string]string
}

type Index struct {
	targets map[string]Target
}

type Result struct {
	Text  string
	HTML  map[string]string
	Links []Link
}

type Link struct {
	Raw    string
	Target string
	Slug   string
	Alias  string
	Exists bool
}

var (
	wikilinkPattern        = regexp.MustCompile(`\[\[([^\[\]\n]+)\]\]`)
	markdownImagePattern   = regexp.MustCompile(`!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)`)
	centerImageHTMLPattern = regexp.MustCompile(`(?is)<p\s+align\s*=\s*["']center["']\s*>\s*<img\s+([^>]*)>\s*</p>`)
	imageHTMLPattern       = regexp.MustCompile(`(?is)<img\s+([^>]*)>`)
	attrPattern            = regexp.MustCompile(`(?is)([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
)

func NewIndex(targets []Target) Index {
	index := Index{targets: make(map[string]Target)}
	for _, target := range targets {
		for _, key := range targetKeys(target) {
			index.targets[normalize(key)] = target
		}
	}
	return index
}

func Process(input string, index Index) Result {
	result := Result{
		Text: input,
		HTML: make(map[string]string),
	}

	result.Text = replaceImageHTML(result.Text, true, result.HTML)
	result.Text = replaceImageHTML(result.Text, false, result.HTML)
	result.Text = rewriteMarkdownImagePaths(result.Text)
	result.Text = wikilinkPattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		inner := strings.TrimSpace(match[2 : len(match)-2])
		if inner == "" {
			return match
		}

		targetText, label := splitAlias(inner)
		noteText, headingText := splitHeading(targetText)
		target, ok := index.find(noteText)

		link := Link{
			Raw:    match,
			Target: noteText,
			Alias:  label,
			Exists: ok,
		}

		if ok {
			link.Slug = target.Slug
		}
		result.Links = append(result.Links, link)

		if !ok {
			return match
		}

		href := "/notes/" + target.Slug + "/"
		if headingText != "" {
			if id := target.headingID(headingText); id != "" {
				href += "#" + url.PathEscape(id)
			}
		}

		if label == "" {
			if headingText != "" {
				label = headingText
			} else {
				label = target.Title
			}
		}

		return "[" + escapeMarkdownLabel(label) + "](" + escapeMarkdownURL(href) + ")"
	})

	return result
}

func RestoreHTML(html string, replacements map[string]string) string {
	for token, trustedHTML := range replacements {
		html = strings.ReplaceAll(html, "<p>"+token+"</p>", trustedHTML)
		html = strings.ReplaceAll(html, token, trustedHTML)
	}
	return html
}

func (index Index) find(key string) (Target, bool) {
	target, ok := index.targets[normalize(key)]
	return target, ok
}

func (target Target) headingID(text string) string {
	if target.Headings == nil {
		return ""
	}
	return target.Headings[normalize(text)]
}

func targetKeys(target Target) []string {
	keys := []string{target.Title, target.Slug}
	if target.SourcePath != "" {
		base := filepath.Base(target.SourcePath)
		keys = append(keys, strings.TrimSuffix(base, filepath.Ext(base)))
	}
	return keys
}

func splitAlias(text string) (string, string) {
	parts := strings.SplitN(text, "|", 2)
	if len(parts) == 1 {
		return strings.TrimSpace(parts[0]), ""
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
}

func splitHeading(text string) (string, string) {
	parts := strings.SplitN(text, "#", 2)
	if len(parts) == 1 {
		return strings.TrimSpace(parts[0]), ""
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
}

func normalize(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func escapeMarkdownLabel(text string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `[`, `\[`, `]`, `\]`)
	return replacer.Replace(text)
}

func escapeMarkdownURL(text string) string {
	return strings.ReplaceAll(text, " ", "%20")
}

func rewriteMarkdownImagePaths(text string) string {
	return markdownImagePattern.ReplaceAllStringFunc(text, func(match string) string {
		parts := markdownImagePattern.FindStringSubmatch(match)
		if len(parts) != 4 {
			return match
		}
		return "![" + parts[1] + "](" + rewriteAssetPath(parts[2]) + parts[3] + ")"
	})
}

func replaceImageHTML(text string, centered bool, replacements map[string]string) string {
	pattern := imageHTMLPattern
	if centered {
		pattern = centerImageHTMLPattern
	}

	return pattern.ReplaceAllStringFunc(text, func(match string) string {
		parts := pattern.FindStringSubmatch(match)
		if len(parts) == 0 {
			return match
		}

		attrText := parts[len(parts)-1]
		attrs := parseAttrs(attrText)
		src := rewriteAssetPath(attrs["src"])
		if src == "" {
			return match
		}

		token := fmt.Sprintf("DAYBOOK_HTML_IMAGE_%d", len(replacements))
		replacements[token] = buildImageHTML(src, attrs, centered)
		return "\n\n" + token + "\n\n"
	})
}

func parseAttrs(text string) map[string]string {
	attrs := make(map[string]string)
	matches := attrPattern.FindAllStringSubmatch(text, -1)
	for _, match := range matches {
		if len(match) == 4 {
			value := match[2]
			if value == "" {
				value = match[3]
			}
			attrs[strings.ToLower(match[1])] = value
		}
	}
	return attrs
}

func buildImageHTML(src string, attrs map[string]string, centered bool) string {
	var builder strings.Builder
	className := "markdown-image"
	if centered {
		className += " markdown-image-center"
	}

	builder.WriteString(`<p class="`)
	builder.WriteString(className)
	builder.WriteString(`"><img src="`)
	builder.WriteString(stdhtml.EscapeString(src))
	builder.WriteString(`"`)

	for _, name := range []string{"alt", "width", "height", "loading", "decoding"} {
		value := strings.TrimSpace(attrs[name])
		if value == "" {
			continue
		}
		if (name == "width" || name == "height") && !safeSize(value) {
			continue
		}
		builder.WriteByte(' ')
		builder.WriteString(name)
		builder.WriteString(`="`)
		builder.WriteString(stdhtml.EscapeString(value))
		builder.WriteString(`"`)
	}

	builder.WriteString(`></p>`)
	return builder.String()
}

func safeSize(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return value != ""
}

func rewriteAssetPath(rawPath string) string {
	if rawPath == "" {
		return ""
	}

	cleaned := strings.TrimSpace(rawPath)
	lowerPath := strings.ToLower(cleaned)
	if strings.HasPrefix(lowerPath, "http://") || strings.HasPrefix(lowerPath, "https://") || strings.HasPrefix(lowerPath, "data:") || strings.HasPrefix(lowerPath, "//") {
		return cleaned
	}

	withoutQuery := cleaned
	if index := strings.IndexAny(cleaned, "?#"); index >= 0 {
		withoutQuery = cleaned[:index]
	}

	switch {
	case strings.HasPrefix(withoutQuery, "./assets/"):
		return "/notes/assets/" + path.Base(withoutQuery)
	case strings.HasPrefix(withoutQuery, "assets/"):
		return "/notes/assets/" + path.Base(withoutQuery)
	case strings.HasPrefix(withoutQuery, "/assets/"):
		return "/notes/assets/" + path.Base(withoutQuery)
	default:
		return cleaned
	}
}
