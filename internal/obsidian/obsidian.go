package obsidian

import (
	"fmt"
	stdhtml "html"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/StatIndet/daybook/internal/markdown"
)

type Target struct {
	Title      string
	Slug       string
	Summary    string
	Content    string
	SourcePath string
	Headings   map[string]string
	Blocks     map[string]string
}

type Attachment struct {
	Name        string
	RelPath     string
	AbsPath     string
	Ext         string
	MediaType   string
	PublishMode string
	PublicURL   string
}

type Index struct {
	targets       map[string]Target
	attachments   map[string]Attachment
	remoteDirs    []string
	remoteBaseURL string
}

type Result struct {
	Text        string
	HTML        map[string]string
	Links       []Link
	Attachments []Attachment
}

type Link struct {
	Raw    string
	Target string
	Slug   string
	Alias  string
	Exists bool
}

var (
	wikilinkPattern        = regexp.MustCompile(`(!)?\[\[([^\[\]\n]+)\]\]`)
	markdownImagePattern   = regexp.MustCompile(`!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)`)
	centerImageHTMLPattern = regexp.MustCompile(`(?is)<p\s+align\s*=\s*["']center["']\s*>\s*<img\s+([^>]*)>\s*</p>`)
	imageHTMLPattern       = regexp.MustCompile(`(?is)<img\s+([^>]*)>`)
	attrPattern            = regexp.MustCompile(`(?is)([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
)

func NewIndex(targets []Target, attachments []Attachment, remoteDirs []string, remoteBaseURL string) Index {
	index := Index{
		targets:       make(map[string]Target),
		attachments:   make(map[string]Attachment),
		remoteDirs:    remoteDirs,
		remoteBaseURL: remoteBaseURL,
	}
	for _, target := range targets {
		for _, key := range targetKeys(target) {
			index.targets[normalize(key)] = target
		}
	}

	basenameCount := make(map[string]int)
	for _, att := range attachments {
		basenameCount[normalize(att.Name)]++
	}

	for _, att := range attachments {
		nameKey := normalize(att.Name)
		if basenameCount[nameKey] > 1 {
			if _, exists := index.attachments[nameKey]; !exists {
				fmt.Printf("[obsidian] ambiguous attachment basename: %s matched multiple files\n", att.Name)
				index.attachments[nameKey] = Attachment{Name: "ambiguous_marker"}
			}
		} else {
			index.attachments[nameKey] = att
		}
		index.attachments[normalize(att.RelPath)] = att
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
	
	result.Text = markdownImagePattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		parts := markdownImagePattern.FindStringSubmatch(match)
		urlStr := parts[2]
		basename := filepath.Base(urlStr)
		if index := strings.IndexAny(basename, "?#"); index >= 0 {
			basename = basename[:index]
		}
		if att, ok := index.findAttachment(basename); ok {
			result.Attachments = append(result.Attachments, att)
		}
		return match
	})
	
	result.Text = wikilinkPattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		parts := wikilinkPattern.FindStringSubmatch(match)
		isEmbed := parts[1] == "!"
		inner := strings.TrimSpace(parts[2])
		if inner == "" {
			return match
		}

		targetText, label := splitAlias(inner)

		// 1. Check if it's an attachment
		if att, ok := index.findAttachment(targetText); ok {
			result.Attachments = append(result.Attachments, att)
			if isEmbed {
				html, ok := renderAttachmentEmbed(att, label)
				if ok {
					token := fmt.Sprintf("DAYBOOK_HTML_EMBED_%d", len(result.HTML))
					result.HTML[token] = html
					return token
				}
				// If not ok (e.g., unsupported type), we could return a warning
				return fmt.Sprintf(`[obsidian] unsupported attachment embed: %s`, match)
			}
			// Regular link to attachment
			return "[" + escapeMarkdownLabel(label) + "](" + escapeMarkdownURL(att.PublicURL) + ")"
		}

		// 2. Check if it's a note
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
			fmt.Printf("[obsidian] unresolved embed: %s\n", match)
			fallbackText := label
			if fallbackText == "" {
				fallbackText = inner
			}
			return fmt.Sprintf(`<a class="wiki-link is-unresolved" href="#">%s</a>`, stdhtml.EscapeString(fallbackText))
		}

		href := "/notes/" + target.Slug + "/"
		if headingText != "" {
			if id := target.headingID(headingText); id != "" {
				href += "#" + url.PathEscape(id)
			} else if !strings.HasPrefix(headingText, "^") {
				fmt.Printf("[obsidian] missing heading: %s in %s\n", headingText, target.Slug)
			}
		}

		if isEmbed {
			// Page / Heading / Block embed
			html := renderNoteEmbed(target, headingText, href, index)
			token := fmt.Sprintf("DAYBOOK_HTML_EMBED_%d", len(result.HTML))
			result.HTML[token] = html
			return token
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

func (idx Index) findAttachment(target string) (Attachment, bool) {
	normTarget := normalize(target)
	att, ok := idx.attachments[normTarget]
	if ok {
		if att.Name == "ambiguous_marker" {
			return Attachment{}, false
		}
		return att, true
	}

	// Dynamic fallback for missing remote attachments
	// target should be the relative path inside content/attachments/
	// (e.g., "audio/JayChou.flac")
	for _, rdir := range idx.remoteDirs {
		// Because target might be normalized or not, we check prefix on original target.
		// Normalize usually makes it lowercase and trims spaces.
		if strings.HasPrefix(target, rdir+"/") || strings.HasPrefix(normTarget, rdir+"/") {
			ext := strings.ToLower(filepath.Ext(target))
			mediaType := ""
			switch {
			case IsImageExt(ext):
				mediaType = "image"
			case ext == ".pdf":
				mediaType = "pdf"
			case IsAudioExt(ext):
				mediaType = "audio"
			case IsVideoExt(ext):
				mediaType = "video"
			}
			
			// We only synthesize if we can determine the type
			if mediaType != "" {
				parts := strings.Split(target, "/")
				for i, part := range parts {
					parts[i] = url.PathEscape(part)
				}
				escapedTarget := strings.Join(parts, "/")
				
				return Attachment{
					Name:        filepath.Base(target),
					RelPath:     target,
					Ext:         ext,
					MediaType:   mediaType,
					PublishMode: "remote",
					PublicURL:   idx.remoteBaseURL + "/" + escapedTarget,
				}, true
			}
		}
	}

	return Attachment{}, false
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
		return token
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

func renderAttachmentEmbed(att Attachment, label string) (string, bool) {
	attrs := parseImageAlias(label)

	alt := att.Name
	if label != "" {
		alt = strings.SplitN(label, "|", 2)[0]
	}
	escapedAlt := stdhtml.EscapeString(alt)

	switch att.MediaType {
	case "pdf":
		return fmt.Sprintf(`<figure class="obsidian-embed obsidian-pdf"><iframe src="%s" loading="lazy" title="%s"></iframe><figcaption><a href="%s" target="_blank" rel="noopener">打开 PDF：%s</a></figcaption></figure>`, att.PublicURL, escapedAlt, att.PublicURL, escapedAlt), true
	case "image":
		var style string
		if attrs.Width != "" {
			style = fmt.Sprintf(` style="--image-width: %spx"`, attrs.Width)
		}
		classes := "obsidian-embed obsidian-image"
		if attrs.Align != "" {
			classes += " is-" + attrs.Align
		}
		return fmt.Sprintf(`<figure class="%s"%s><img src="%s" alt="%s" loading="lazy" decoding="async"></figure>`, classes, style, att.PublicURL, escapedAlt), true
	case "audio":
		var classes = "obsidian-embed obsidian-audio"
		if attrs.Align == "center" {
			classes += " is-center" // Assuming similar align class for simplicity, wait, user wants `class="obsidian-embed obsidian-audio is-center"` if center? I'll use standard classes and CSS.
		}
		return fmt.Sprintf(`<figure class="%s"><audio controls preload="metadata" src="%s"></audio><figcaption>%s</figcaption></figure>`, classes, att.PublicURL, escapedAlt), true
	case "video":
		var classes = "obsidian-embed obsidian-video"
		if attrs.Align != "" {
			classes += " is-" + attrs.Align
		}
		var widthAttr string
		if attrs.Width != "" {
			widthAttr = fmt.Sprintf(` width="%s"`, stdhtml.EscapeString(attrs.Width))
		}
		return fmt.Sprintf(`<figure class="%s"><video controls preload="metadata" src="%s"%s></video><figcaption>%s</figcaption></figure>`, classes, att.PublicURL, widthAttr, escapedAlt), true
	}

	return "", false
}

func IsImageExt(ext string) bool {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg":
		return true
	}
	return false
}

func IsAudioExt(ext string) bool {
	switch ext {
	case ".flac", ".mp3", ".wav", ".ogg", ".m4a":
		return true
	}
	return false
}

func IsVideoExt(ext string) bool {
	switch ext {
	case ".mp4", ".webm", ".mov":
		return true
	}
	return false
}

type ImageAttrs struct {
	Width  string
	Height string
	Align  string
}

func parseImageAlias(label string) ImageAttrs {
	if label == "" {
		return ImageAttrs{}
	}

	parts := strings.Split(label, "|")
	attrs := ImageAttrs{}

	for _, part := range parts {
		part = strings.TrimSpace(strings.ToLower(part))
		if part == "center" || part == "left" || part == "right" {
			attrs.Align = part
			continue
		}

		if strings.Contains(part, "x") {
			dims := strings.SplitN(part, "x", 2)
			if safeSize(dims[0]) && safeSize(dims[1]) {
				attrs.Width = dims[0]
				attrs.Height = dims[1]
			}
			continue
		}

		if safeSize(part) {
			attrs.Width = part
		}
	}

	return attrs
}

func extractHeadingSection(content string, targetHeading string) string {
	lines := strings.Split(content, "\n")
	var section []string
	inSection := false
	var targetLevel int

	targetNorm := strings.ToLower(strings.TrimSpace(targetHeading))
	if targetNorm == "" {
		return ""
	}

	for _, line := range lines {
		level := 0
		for _, r := range line {
			if r == '#' {
				level++
			} else {
				break
			}
		}

		isHeading := level > 0 && len(line) > level && (line[level] == ' ' || line[level] == '\t')

		if isHeading {
			headingText := strings.TrimSpace(line[level:])
			headingNorm := strings.ToLower(headingText)

			if !inSection {
				if headingNorm == targetNorm {
					inSection = true
					targetLevel = level
					section = append(section, line)
				}
			} else {
				if level <= targetLevel {
					break
				}
				section = append(section, line)
			}
		} else if inSection {
			section = append(section, line)
		}
	}

	return strings.Join(section, "\n")
}

func renderNoteEmbed(target Target, heading string, href string, index Index) string {
	var rawMarkdown string
	isBlockOrSection := false

	if heading != "" && strings.HasPrefix(heading, "^") {
		if block, ok := target.Blocks[heading[1:]]; ok {
			rawMarkdown = block
			isBlockOrSection = true
		} else {
			fmt.Printf("[obsidian] missing block: %s in %s\n", heading, target.Slug)
			return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">未找到目标区块</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, escapeMarkdownURL(href))
		}
	} else if heading != "" {
		rawMarkdown = extractHeadingSection(target.Content, heading)
		if rawMarkdown == "" {
			fmt.Printf("[obsidian] missing heading content: %s in %s\n", heading, target.Slug)
			return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">未找到目标小节</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, escapeMarkdownURL(href))
		} else {
			isBlockOrSection = true
		}
	} else {
		titleHTML := fmt.Sprintf(`<div class="obsidian-embed-title">%s</div>`, stdhtml.EscapeString(target.Title))
		if target.Summary != "" {
			rawMarkdown = titleHTML + "\n" + fmt.Sprintf(`<div class="obsidian-embed-summary">%s</div>`, stdhtml.EscapeString(target.Summary))
		} else {
			rawMarkdown = titleHTML
		}
	}

	var contentHTML string
	if isBlockOrSection {
		// Escape nested embeds to prevent infinite recursion
		safeMarkdown := strings.ReplaceAll(rawMarkdown, "![[", "[[")

		// Process standard wikilinks
		result := Process(safeMarkdown, index)

		// Convert to HTML
		htmlBytes, err := markdown.ToHTML(result.Text)
		if err == nil {
			contentHTML = htmlBytes
			contentHTML = RestoreHTML(contentHTML, result.HTML)
		} else {
			contentHTML = stdhtml.EscapeString(rawMarkdown)
		}
	} else {
		// For full note embed summary, it's already HTML
		contentHTML = rawMarkdown
	}

	return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">%s</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, contentHTML, escapeMarkdownURL(href))
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
