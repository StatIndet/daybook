package obsidian

import (
	"net/url"
	"fmt"
	stdhtml "html"
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
	allTargets          []Target
	targets             map[string]Target // deprecated map for fast lookup of exact unique matches (optional)
	attachments         map[string]Attachment
	allAttachments      []Attachment
	publicPath          string
	appAttachmentFolder string
	newLinkFormat       string
}

type Result struct {
	Text        string
	HTML        map[string]string
	Links       []Link
	Attachments []Attachment
	Diagnostics []Diagnostic
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

func NewIndex(targets []Target, attachments []Attachment, publicPath string, appAttachmentFolder string, newLinkFormat string) Index {
	if newLinkFormat == "" {
		newLinkFormat = "shortest"
	}
	index := Index{
		allTargets:          targets,
		targets:             make(map[string]Target),
		attachments:         make(map[string]Attachment),
		allAttachments:      attachments,
		publicPath:          publicPath,
		appAttachmentFolder: appAttachmentFolder,
		newLinkFormat:       newLinkFormat,
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
				index.attachments[nameKey] = Attachment{Name: "ambiguous_marker"}
			}
		} else {
			index.attachments[nameKey] = att
		}
		index.attachments[normalize(att.RelPath)] = att
	}
	return index
}

func Process(input string, index Index, sourcePath string, bodyStartLine int) Result {
	return processWithContext(input, index, sourcePath, bodyStartLine, 0, nil)
}

func getMaskedInput(input string) string {
	masked := []byte(input)
	blankOut := func(pattern *regexp.Regexp) {
		for _, loc := range pattern.FindAllIndex(masked, -1) {
			for i := loc[0]; i < loc[1]; i++ {
				if masked[i] != '\n' {
					masked[i] = ' '
				}
			}
		}
	}
	blankOut(regexp.MustCompile(`(?s)%%.*?%%`))
	blankOut(regexp.MustCompile("(?sm)^ {0,3}````*.*?^ {0,3}````*[ \t]*$"))
	blankOut(regexp.MustCompile("(?sm)^ {0,3}~~~~*.*?^ {0,3}~~~~*[ \t]*$"))
	blankOut(regexp.MustCompile("(?s)`+.*?`+"))
	return string(masked)
}

func processWithContext(input string, index Index, sourcePath string, bodyStartLine int, embedDepth int, visited map[string]bool) Result {
	result := Result{
		Text: input,
		HTML: make(map[string]string),
	}

	var protectedTokens map[string]string
	result.Text, protectedTokens = markdown.ProtectCode(result.Text, func(i int) string {
		return fmt.Sprintf("DAYBOOK_PROTECTED_%d", i)
	})

	result.Text = replaceImageHTML(&result, true, index, sourcePath)
	result.Text = replaceImageHTML(&result, false, index, sourcePath)
	
	maskedInputStr := getMaskedInput(input)
	lastSearchIndex := 0

	result.Text = markdownImagePattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		matchStart := strings.Index(maskedInputStr[lastSearchIndex:], match)
		if matchStart != -1 {
			matchStart += lastSearchIndex
			lastSearchIndex = matchStart + len(match)
		}

		parts := markdownImagePattern.FindStringSubmatch(match)
		urlStr := parts[2]
		basename := filepath.Base(urlStr)
		if index := strings.IndexAny(basename, "?#"); index >= 0 {
			basename = basename[:index]
		}
		
		targetUrl := urlStr
		if index := strings.IndexAny(targetUrl, "?#"); index >= 0 {
			targetUrl = targetUrl[:index]
		}
		
		if att, ok, candidates := index.ResolveAttachment(targetUrl, sourcePath); ok {
			result.Attachments = append(result.Attachments, att)
			if len(parts) == 4 {
				return "![" + parts[1] + "](" + escapeMarkdownURL(att.PublicURL) + parts[3] + ")"
			}
		} else if len(candidates) > 0 {
			line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
			result.Diagnostics = append(result.Diagnostics, Diagnostic{
				Severity:   "warning",
				Code:       "obsidian/ambiguous-attachment",
				Message:    fmt.Sprintf("attachment %q matches multiple files", targetUrl),
				SourcePath: sourcePath,
				Line:       line,
				Column:     col,
				Snippet:    snippet,
				Candidates: candidates,
			})
		}
		
		if len(parts) == 4 {
			return "![" + parts[1] + "](" + rewriteAssetPath(parts[2]) + parts[3] + ")"
		}
		return match
	})
	
	lastSearchIndex = 0

	result.Text = wikilinkPattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		matchStart := strings.Index(maskedInputStr[lastSearchIndex:], match)
		if matchStart != -1 {
			matchStart += lastSearchIndex
			lastSearchIndex = matchStart + len(match)
		}

		parts := wikilinkPattern.FindStringSubmatch(match)
		isEmbed := parts[1] == "!"
		inner := strings.TrimSpace(parts[2])
		if inner == "" {
			return match
		}

		// 1. Parse semantics
		targetText, label := splitAlias(inner)
		noteText, headingText := splitHeading(targetText)

		// Determine if it has a definite media extension
		ext := filepath.Ext(targetText)
		isDefiniteMedia := IsImageExt(ext) || IsAudioExt(ext) || IsVideoExt(ext) || ext == ".pdf"

		var tryResolveNote = func() (bool, string) {
			target, ok, candidates := index.ResolveNote(noteText, sourcePath)
			if ok {
				link := Link{
					Raw:    match,
					Target: noteText,
					Alias:  label,
					Exists: true,
					Slug:   target.Slug,
				}
				result.Links = append(result.Links, link)

				href := "/notes/" + target.Slug + "/"
				if headingText != "" {
					if id := target.headingID(headingText); id != "" {
						href += "#" + url.PathEscape(id)
					} else if !strings.HasPrefix(headingText, "^") {
						line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
						result.Diagnostics = append(result.Diagnostics, Diagnostic{
							Severity:   "warning",
							Code:       "obsidian/missing-heading",
							Message:    fmt.Sprintf("missing heading: %q in %s", headingText, target.Slug),
							SourcePath: sourcePath,
							Line:       line,
							Column:     col,
							Snippet:    snippet,
						})
					}
				}

				if isEmbed {
					html, missingBlock := renderNoteEmbed(target, headingText, href, index, embedDepth, visited)
					if missingBlock {
						line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
						result.Diagnostics = append(result.Diagnostics, Diagnostic{
							Severity:   "warning",
							Code:       "obsidian/missing-block",
							Message:    fmt.Sprintf("missing block or section for heading: %q in %s", headingText, target.Slug),
							SourcePath: sourcePath,
							Line:       line,
							Column:     col,
							Snippet:    snippet,
						})
					}
					token := fmt.Sprintf("DAYBOOK_HTML_EMBED_%d", len(result.HTML))
					result.HTML[token] = html
					return true, token
				}

				if label == "" {
					if headingText != "" && !strings.HasPrefix(headingText, "^") {
						label = headingText
					} else {
						label = target.Title
					}
				}
				return true, "[" + escapeMarkdownLabel(label) + "](" + escapeMarkdownURL(href) + ")"
			}
			
			if len(candidates) > 0 {
				line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
				msg := "note \"" + noteText + "\" matches multiple files\n  candidates:\n"
				for _, c := range candidates {
					msg += "    " + c + "\n"
				}
				result.Diagnostics = append(result.Diagnostics, Diagnostic{
					Severity:   "warning",
					Code:       "obsidian/ambiguous-note",
					Message:    msg,
					SourcePath: sourcePath,
					Line:       line,
					Column:     col,
					Snippet:    snippet,
				})
				
				fallbackText := label
				if fallbackText == "" {
					fallbackText = inner
				}
				return true, fmt.Sprintf("<a class=\"wiki-link is-unresolved\" href=\"#\">%s</a>", stdhtml.EscapeString(fallbackText))
			}
			return false, ""
		}

		var tryResolveAttachment = func() (bool, string) {
			att, ok, candidates := index.ResolveAttachment(targetText, sourcePath)
			if ok {
				result.Attachments = append(result.Attachments, att)
				if isEmbed {
					html, ok := renderAttachmentEmbed(att, label)
					if ok {
						token := fmt.Sprintf("DAYBOOK_HTML_EMBED_%d", len(result.HTML))
						result.HTML[token] = html
						return true, token
					}
					line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
					result.Diagnostics = append(result.Diagnostics, Diagnostic{
						Severity:   "warning",
						Code:       "obsidian/unsupported-attachment",
						Message:    fmt.Sprintf("unsupported attachment embed: %q", targetText),
						SourcePath: sourcePath,
						Line:       line,
						Column:     col,
						Snippet:    snippet,
					})
					return true, match
				}
				return true, "[" + escapeMarkdownLabel(label) + "](" + escapeMarkdownURL(att.PublicURL) + ")"
			}
			if len(candidates) > 0 {
				line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
				msg := "attachment \"" + targetText + "\" matches multiple files\n  candidates:\n"
				for _, c := range candidates {
					msg += "    " + c + "\n"
				}
				result.Diagnostics = append(result.Diagnostics, Diagnostic{
					Severity:   "warning",
					Code:       "obsidian/ambiguous-attachment",
					Message:    msg,
					SourcePath: sourcePath,
					Line:       line,
					Column:     col,
					Snippet:    snippet,
				})
				fallbackText := label
				if fallbackText == "" {
					fallbackText = inner
				}
				return true, fmt.Sprintf("<a class=\"wiki-link is-unresolved\" href=\"#\">%s</a>", stdhtml.EscapeString(fallbackText))
			}
			return false, ""
		}

		// 2. Dispatch based on semantics
		if isDefiniteMedia {
			if handled, res := tryResolveAttachment(); handled {
				return res
			}
		} else {
			if handled, res := tryResolveNote(); handled {
				return res
			}
			if handled, res := tryResolveAttachment(); handled {
				return res
			}
		}

		// 3. Fallback (both failed)
		line, col, snippet := getLineColSnippet(input, matchStart, bodyStartLine)
		if isDefiniteMedia {
			result.Diagnostics = append(result.Diagnostics, Diagnostic{
				Severity:   "warning",
				Code:       "obsidian/unresolved-attachment",
				Message:    fmt.Sprintf("attachment %q could not be resolved", targetText),
				SourcePath: sourcePath,
				Line:       line,
				Column:     col,
				Snippet:    snippet,
			})
		} else {
			result.Diagnostics = append(result.Diagnostics, Diagnostic{
				Severity:   "warning",
				Code:       "obsidian/unresolved-note",
				Message:    fmt.Sprintf("note %q could not be resolved", noteText),
				SourcePath: sourcePath,
				Line:       line,
				Column:     col,
				Snippet:    snippet,
			})
			link := Link{
				Raw:    match,
				Target: noteText,
				Alias:  label,
				Exists: false,
			}
			result.Links = append(result.Links, link)
		}

		fallbackText := label
		if fallbackText == "" {
			fallbackText = inner
		}
		return fmt.Sprintf("<a class=\"wiki-link is-unresolved\" href=\"#\">%s</a>", stdhtml.EscapeString(fallbackText))
	})

	// Restore protected text
	for i := len(protectedTokens) - 1; i >= 0; i-- {
		token := fmt.Sprintf("DAYBOOK_PROTECTED_%d", i)
		result.Text = strings.ReplaceAll(result.Text, token, protectedTokens[token])
	}

	return result
}

func RestoreHTML(html string, replacements map[string]string) string {
	for token, trustedHTML := range replacements {
		html = strings.ReplaceAll(html, "<p>"+token+"</p>", trustedHTML)
		html = strings.ReplaceAll(html, token, trustedHTML)
	}
	return html
}


// ResolveAttachment resolves an attachment reference according to Obsidian rules.
func (idx Index) ResolveAttachment(target string, sourcePath string) (Attachment, bool, []string) {
	// target is the raw link inside ![[target]]. It might be "a.png" or "sub/a.png"
	
	// Helper to lookup exact path in our map
	lookupPath := func(p string) (Attachment, bool) {
		norm := normalize(filepath.ToSlash(p))
		att, ok := idx.attachments[norm]
		if ok && att.Name != "ambiguous_marker" {
			return att, true
		}
		return Attachment{}, false
	}

	// 1. Explicit Vault-relative target
	if att, ok := lookupPath(target); ok {
		return att, true, nil
	}

	var noteDir string
	if sourcePath != "" {
		noteDir = filepath.ToSlash(filepath.Dir(sourcePath))
		if noteDir == "." {
			noteDir = ""
		}
	}

	// 2. Current note-relative path
	if noteDir != "" {
		if att, ok := lookupPath(path.Join(noteDir, target)); ok {
			return att, true, nil
		}
	}

	// 3. attachmentFolderPath logic
	folder := strings.TrimSpace(idx.appAttachmentFolder)
	if folder == "" || folder == "/" {
		// Vault root fallback - already checked by step 1
	} else if strings.HasPrefix(folder, "./") {
		// Current folder or subfolder
		sub := strings.TrimPrefix(folder, "./")
		searchDir := noteDir
		if sub != "" {
			searchDir = path.Join(noteDir, sub)
		}
		if searchDir != "" {
			if att, ok := lookupPath(path.Join(searchDir, target)); ok {
				return att, true, nil
			}
		}
	} else {
		// Fixed directory
		if att, ok := lookupPath(path.Join(folder, target)); ok {
			return att, true, nil
		}
	}

	// 4. Unique basename fallback
	basename := filepath.Base(target)
	normBasename := normalize(basename)
	att, ok := idx.attachments[normBasename]
	if ok {
		if att.Name == "ambiguous_marker" {
			var candidates []string
			for _, a := range idx.allAttachments {
				if normalize(a.Name) == normBasename {
					candidates = append(candidates, a.RelPath)
				}
			}
			return Attachment{}, false, candidates
		}
		return att, true, nil
	}

	return Attachment{}, false, nil
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


func replaceImageHTML(result *Result, centered bool, index Index, sourcePath string) string {
	pattern := imageHTMLPattern
	if centered {
		pattern = centerImageHTMLPattern
	}

	return pattern.ReplaceAllStringFunc(result.Text, func(match string) string {
		parts := pattern.FindStringSubmatch(match)
		if len(parts) == 0 {
			return match
		}

		attrText := parts[len(parts)-1]
		attrs := parseAttrs(attrText)
		src := attrs["src"]
		if src == "" {
			return match
		}

		targetUrl := src
		if idx := strings.IndexAny(targetUrl, "?#"); idx >= 0 {
			targetUrl = targetUrl[:idx]
		}

		if att, ok, _ := index.ResolveAttachment(targetUrl, sourcePath); ok {
			result.Attachments = append(result.Attachments, att)
			src = att.PublicURL
		} else {
			src = rewriteAssetPath(src)
		}

		token := fmt.Sprintf("DAYBOOK_HTML_IMAGE_%d", len(result.HTML))
		result.HTML[token] = buildImageHTML(src, attrs, centered)
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

	m := markdown.MediaEmbed{
		URL:   att.PublicURL,
		Alt:   alt,
		Width: attrs.Width,
		Align: attrs.Align,
	}

	// We only map label to Caption if it explicitly looks like a caption? 
	// The user said: "只有用户显式指定 caption 时，才显示 figcaption。本地 alias 如果当前存在可合理映射为 caption 的语义，再按照现有语法兼容；不要随便把 center/500 当 caption。"
	// If label is not empty and not just width/align, we can use it as Alt. Should it be Caption?
	// Obsidian natively uses the alias (label) as Alt text, not caption. We'll leave Caption empty unless it's explicitly supported in some way. We'll just use it for Alt.

	switch att.MediaType {
	case "pdf":
		m.Kind = "pdf"
		m.Alt = alt
		return markdown.RenderMediaEmbed(m), true
	case "image":
		m.Kind = "image"
		return markdown.RenderMediaEmbed(m), true
	case "audio":
		m.Kind = "audio"
		return markdown.RenderMediaEmbed(m), true
	case "video":
		m.Kind = "video"
		return markdown.RenderMediaEmbed(m), true
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

func renderNoteEmbed(target Target, heading string, href string, index Index, embedDepth int, visited map[string]bool) (string, bool) {
	if visited == nil {
		visited = make(map[string]bool)
	}

	if embedDepth > 5 || visited[target.SourcePath] {
		label := target.Title
		if heading != "" {
			label += "#" + heading
		}
		fallback := fmt.Sprintf(`<a class="wiki-link is-unresolved" href="%s" data-tooltip="Cycle detected">%s</a>`, escapeMarkdownURL(href), stdhtml.EscapeString(label))
		return fallback, false
	}
	
	newVisited := make(map[string]bool)
	for k, v := range visited {
		newVisited[k] = v
	}
	newVisited[target.SourcePath] = true

	var rawMarkdown string
	missingBlock := false
	isWholeNote := false

	if heading != "" && strings.HasPrefix(heading, "^") {
		if block, ok := target.Blocks[heading[1:]]; ok {
			rawMarkdown = block
		} else {
			missingBlock = true
			return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">未找到目标区块</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, escapeMarkdownURL(href)), missingBlock
		}
	} else if heading != "" {
		rawMarkdown = extractHeadingSection(target.Content, heading)
		if rawMarkdown == "" {
			missingBlock = true
			return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">未找到目标小节</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, escapeMarkdownURL(href)), missingBlock
		}
	} else {
		isWholeNote = true
		rawMarkdown = target.Content
	}

	result := processWithContext(rawMarkdown, index, target.SourcePath, 1, embedDepth+1, newVisited)

	var contentHTML string
	htmlBytes, err := markdown.ToHTML(result.Text)
	if err == nil {
		contentHTML = htmlBytes
		contentHTML = RestoreHTML(contentHTML, result.HTML)
	} else {
		contentHTML = stdhtml.EscapeString(rawMarkdown)
	}
	
	if isWholeNote {
		titleHTML := fmt.Sprintf(`<div class="obsidian-embed-title">%s</div>`, stdhtml.EscapeString(target.Title))
		contentHTML = titleHTML + "\n" + contentHTML
	}

	return fmt.Sprintf(`<blockquote class="obsidian-embed obsidian-note-embed" data-embed-type="note"><div class="obsidian-embed-content">%s</div><a href="%s" data-tooltip="在新页面打开" aria-label="在新页面打开" class="obsidian-embed-link" target="_blank" rel="noopener"><span class="material-symbol">open_in_new</span></a></blockquote>`, contentHTML, escapeMarkdownURL(href)), missingBlock
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
