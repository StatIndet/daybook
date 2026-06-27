package markdown

import (
	"fmt"
	stdhtml "html"
	"os"
	"regexp"
	"strings"
)

const maxExtensionDepth = 8

type htmlReplacement struct {
	Token string
	HTML  string
}

type extensionContext struct {
	renderer     markdownRenderer
	depth        int
	replacements []htmlReplacement
	hasMermaid   bool
	mathItems    []MathItem
}

type containerDirective struct {
	FenceLength int
	Name        string
	Title       string
}

var (
	htmlImageParagraphPattern = regexp.MustCompile(`(?s)<p>((?:\s*<img\s+[^>]*>)+)\s*</p>`)
	htmlAttrPattern           = regexp.MustCompile(`(?i)([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
	imgTagPattern             = regexp.MustCompile(`(?i)<img\s+([^>]*)>`)
)

type calloutInfo struct {
	Type          string
	OriginalType  string
	Title         string
	IsCollapsible bool
	IsDefaultOpen bool
}

var calloutTitles = map[string]string{
	"note":      "Note",
	"tip":       "Tip",
	"important": "Important",
	"warning":   "Warning",
	"caution":   "Caution",
	"abstract":  "Abstract",
	"info":      "Info",
	"todo":      "Todo",
	"success":   "Success",
	"question":  "Question",
	"failure":   "Failure",
	"danger":    "Danger",
	"bug":       "Bug",
	"example":   "Example",
	"quote":     "Quote",
}

var calloutAliases = map[string]string{
	"summary":   "abstract",
	"tldr":      "abstract",
	"hint":      "tip",
	"check":     "success",
	"done":      "success",
	"help":      "question",
	"faq":       "question",
	"attention": "warning",
	"fail":      "failure",
	"missing":   "failure",
	"error":     "danger",
	"cite":      "quote",
}

var calloutIcons = map[string]string{
	"note":      "info",
	"abstract":  "subject",
	"info":      "info",
	"todo":      "checklist",
	"tip":       "lightbulb",
	"important": "priority_high",
	"success":   "check_circle",
	"question":  "help",
	"warning":   "warning",
	"caution":   "error",
	"failure":   "cancel",
	"danger":    "report",
	"bug":       "bug_report",
	"example":   "science",
	"quote":     "format_quote",
}

func (renderer markdownRenderer) processExtensions(input string, depth int) (string, []htmlReplacement, bool, error) {
	if depth >= maxExtensionDepth {
		return input, nil, false, nil
	}

	context := extensionContext{
		renderer: renderer,
		depth:    depth,
	}

	input = extractMath(input, &context)

	if len(context.mathItems) > 0 {
		results, err := renderMathBlocks(context.mathItems)
		if err != nil {
			return "", nil, false, err
		}
		for _, result := range results {
			if !result.OK {
				fmt.Fprintf(os.Stderr, "KaTeX 渲染错误 (%s): %s\n", result.ID, result.Error)
			}
			finalToken := context.addHTML(result.HTML)
			input = strings.ReplaceAll(input, result.ID, finalToken)
		}
	}

	lines := strings.Split(input, "\n")
	output := make([]string, 0, len(lines))
	inCodeFence := false
	codeFenceChar := byte(0)
	codeFenceLength := 0

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if char, length, ok := markdownFence(line); ok {
			if !inCodeFence && isMermaidFence(line, length) {
				end := findCodeFenceEnd(lines, i+1, char, length)
				if end < 0 {
					output = append(output, line)
					continue
				}

				source := strings.Join(lines[i+1:end], "\n")
				output = append(output, context.addHTML(renderMermaidBlock(source)))
				context.hasMermaid = true
				i = end
				continue
			}

			if !inCodeFence {
				inCodeFence = true
				codeFenceChar = char
				codeFenceLength = length
			} else if char == codeFenceChar && length >= codeFenceLength {
				inCodeFence = false
				codeFenceChar = 0
				codeFenceLength = 0
			}
			output = append(output, line)
			continue
		}

		if inCodeFence {
			output = append(output, line)
			continue
		}

		if info, ok := parseCalloutStart(line); ok {
			contentLines := []string{}

			next := i + 1
			for next < len(lines) {
				content, ok := stripBlockquoteMarker(lines[next])
				if !ok {
					break
				}
				contentLines = append(contentLines, content)
				next++
			}

			html, err := context.renderCallout(info, strings.Join(contentLines, "\n"))
			if err != nil {
				return "", nil, false, err
			}
			output = append(output, context.addHTML(html))
			i = next - 1
			continue
		}

		if directive, ok := parseContainerDirective(line); ok {
			end := findContainerEnd(lines, i+1, directive.FenceLength)
			if end < 0 {
				output = append(output, line)
				continue
			}

			inner := strings.Join(lines[i+1:end], "\n")
			html, ok, err := context.renderContainer(directive, inner)
			if err != nil {
				return "", nil, false, err
			}
			if !ok {
				output = append(output, lines[i:end+1]...)
				i = end
				continue
			}

			output = append(output, context.addHTML(html))
			i = end
			continue
		}

		if name, attrs, ok := parseLeafDirective(line); ok {
			if html, ok := renderLeafEmbed(name, attrs); ok {
				output = append(output, context.addHTML(html))
				continue
			}
		}

		output = append(output, line)
	}

	return strings.Join(output, "\n"), context.replacements, context.hasMermaid, nil
}

func (context *extensionContext) addHTML(html string) string {
	token := fmt.Sprintf("DAYBOOK_MARKDOWN_HTML_%d_%d_END", context.depth, len(context.replacements))
	context.replacements = append(context.replacements, htmlReplacement{
		Token: token,
		HTML:  html,
	})
	return token
}

func restoreHTMLReplacements(html string, replacements []htmlReplacement) string {
	for index := len(replacements) - 1; index >= 0; index-- {
		replacement := replacements[index]
		html = strings.ReplaceAll(html, "<p>"+replacement.Token+"</p>", replacement.HTML)
		html = strings.ReplaceAll(html, replacement.Token, replacement.HTML)
	}
	return html
}

func (context *extensionContext) renderCallout(info calloutInfo, content string) (string, error) {
	if info.Title == "" {
		if defaultTitle, ok := calloutTitles[info.OriginalType]; ok {
			info.Title = defaultTitle
		} else if defaultTitle, ok := calloutTitles[strings.ToLower(info.OriginalType)]; ok {
			info.Title = defaultTitle
		} else if defaultTitle, ok := calloutTitles[info.Type]; ok {
			info.Title = defaultTitle
		} else {
			info.Title = strings.ToUpper(info.OriginalType[:1]) + info.OriginalType[1:]
		}
	}

	document, err := context.renderer.render(content, false, context.depth+1)
	if err != nil {
		return "", err
	}
	context.hasMermaid = context.hasMermaid || document.HasMermaid
	contentHTML := strings.TrimSpace(document.HTML)
	isTitleOnly := contentHTML == ""

	iconName := "info"
	if name, ok := calloutIcons[info.Type]; ok {
		iconName = name
	}

	var builder strings.Builder
	if info.IsCollapsible {
		builder.WriteString(`<details class="callout is-collapsible" data-callout="`)
		builder.WriteString(info.Type)
		builder.WriteString(`"`)
		if info.OriginalType != info.Type && strings.ToLower(info.OriginalType) != info.Type {
			builder.WriteString(` data-callout-original="`)
			builder.WriteString(stdhtml.EscapeString(info.OriginalType))
			builder.WriteString(`"`)
		}
		if info.IsDefaultOpen {
			builder.WriteString(` open`)
		}
		builder.WriteString(`>`)

		builder.WriteString(`<summary class="callout-title">`)
		builder.WriteString(`<span class="callout-icon material-symbol">`)
		builder.WriteString(iconName)
		builder.WriteString(`</span>`)
		builder.WriteString(`<div class="callout-title-inner">`)
		builder.WriteString(stdhtml.EscapeString(info.Title))
		builder.WriteString(`</div>`)
		builder.WriteString(`<span class="callout-fold-icon material-symbol">expand_more</span>`)
		builder.WriteString(`</summary>`)

		builder.WriteString(`<div class="callout-content">`)
		if !isTitleOnly {
			builder.WriteString(contentHTML)
		} else {
			builder.WriteString(`<p></p>`)
		}
		builder.WriteString(`</div></details>`)
	} else {
		builder.WriteString(`<div class="callout`)
		if isTitleOnly {
			builder.WriteString(` is-title-only`)
		}
		builder.WriteString(`" data-callout="`)
		builder.WriteString(info.Type)
		builder.WriteString(`"`)
		if info.OriginalType != info.Type && strings.ToLower(info.OriginalType) != info.Type {
			builder.WriteString(` data-callout-original="`)
			builder.WriteString(stdhtml.EscapeString(info.OriginalType))
			builder.WriteString(`"`)
		}
		builder.WriteString(`>`)

		builder.WriteString(`<div class="callout-title">`)
		builder.WriteString(`<span class="callout-icon material-symbol">`)
		builder.WriteString(iconName)
		builder.WriteString(`</span>`)
		builder.WriteString(`<div class="callout-title-inner">`)
		builder.WriteString(stdhtml.EscapeString(info.Title))
		builder.WriteString(`</div>`)
		builder.WriteString(`</div>`)

		if !isTitleOnly {
			builder.WriteString(`<div class="callout-content">`)
			builder.WriteString(contentHTML)
			builder.WriteString(`</div>`)
		}
		builder.WriteString(`</div>`)
	}

	return builder.String(), nil
}

func (context *extensionContext) renderContainer(directive containerDirective, content string) (string, bool, error) {
	name := strings.ToLower(directive.Name)
	if _, ok := calloutTitles[name]; ok {
		info := calloutInfo{
			Type:         name,
			OriginalType: directive.Name,
			Title:        directive.Title,
		}
		html, err := context.renderCallout(info, content)
		return html, true, err
	}

	switch name {
	case "fold":
		html, err := context.renderFold(directive.Title, content)
		return html, true, err
	case "gallery":
		html, err := context.renderGallery(content)
		return html, true, err
	default:
		return "", false, nil
	}
}

func (context *extensionContext) renderFold(title, content string) (string, error) {
	if strings.TrimSpace(title) == "" {
		title = "展开查看"
	}

	document, err := context.renderer.render(content, false, context.depth+1)
	if err != nil {
		return "", err
	}
	context.hasMermaid = context.hasMermaid || document.HasMermaid
	contentHTML := strings.TrimSpace(document.HTML)

	var builder strings.Builder
	builder.WriteString(`<details class="md-fold">`)
	builder.WriteString(`<summary>`)
	builder.WriteString(stdhtml.EscapeString(title))
	builder.WriteString(`</summary>`)
	builder.WriteString(`<div class="md-fold-content">`)
	builder.WriteString(contentHTML)
	builder.WriteString(`</div></details>`)
	return builder.String(), nil
}

func (context *extensionContext) renderGallery(content string) (string, error) {
	document, err := context.renderer.render(content, false, context.depth+1)
	if err != nil {
		return "", err
	}
	context.hasMermaid = context.hasMermaid || document.HasMermaid
	contentHTML := strings.TrimSpace(document.HTML)

	var builder strings.Builder
	builder.WriteString(`<div class="md-gallery">`)
	builder.WriteString(contentHTML)
	builder.WriteString(`</div>`)
	return builder.String(), nil
}

func isMermaidFence(line string, fenceLength int) bool {
	info := strings.ToLower(strings.TrimSpace(markdownFenceInfo(line, fenceLength)))
	if info == "" {
		return false
	}

	fields := strings.Fields(info)
	if len(fields) == 0 {
		return false
	}
	return fields[0] == "mermaid" || fields[0] == "{mermaid}"
}

func markdownFenceInfo(line string, fenceLength int) string {
	trimmed := strings.TrimLeft(line, " \t")
	if len(trimmed) < fenceLength {
		return ""
	}
	return trimmed[fenceLength:]
}

func findCodeFenceEnd(lines []string, start int, fenceChar byte, fenceLength int) int {
	for i := start; i < len(lines); i++ {
		char, length, ok := markdownFence(lines[i])
		if ok && char == fenceChar && length >= fenceLength {
			return i
		}
	}
	return -1
}

func renderMermaidBlock(source string) string {
	escapedSource := stdhtml.EscapeString(source)
	return `<div class="mermaid-block" data-mermaid-status="pending"><pre class="mermaid-source"><code>` +
		escapedSource +
		`</code></pre><div class="mermaid-diagram" aria-hidden="true"></div><p class="mermaid-error" hidden></p></div>`
}

func parseCalloutStart(line string) (calloutInfo, bool) {
	content, ok := stripBlockquoteMarker(line)
	if !ok {
		return calloutInfo{}, false
	}

	trimmed := strings.TrimLeft(content, " \t")
	if !strings.HasPrefix(trimmed, "[!") {
		return calloutInfo{}, false
	}

	end := strings.IndexByte(trimmed, ']')
	if end < 0 {
		return calloutInfo{}, false
	}

	typeStr := strings.TrimSpace(trimmed[2:end])
	if typeStr == "" {
		return calloutInfo{}, false
	}
	if strings.ContainsAny(typeStr, " \t\n\r") {
		return calloutInfo{}, false
	}

	info := calloutInfo{
		OriginalType: typeStr,
	}

	rest := strings.TrimLeft(trimmed[end+1:], " \t")

	if strings.HasPrefix(rest, "+") {
		info.IsCollapsible = true
		info.IsDefaultOpen = true
		rest = strings.TrimLeft(rest[1:], " \t")
	} else if strings.HasPrefix(rest, "-") {
		info.IsCollapsible = true
		info.IsDefaultOpen = false
		rest = strings.TrimLeft(rest[1:], " \t")
	}

	info.Title = strings.TrimSpace(rest)

	lowerType := strings.ToLower(typeStr)
	if alias, ok := calloutAliases[lowerType]; ok {
		info.Type = alias
	} else {
		info.Type = lowerType
	}

	if _, ok := calloutTitles[info.Type]; !ok {
		info.Type = "note"
	}

	return info, true
}

func stripBlockquoteMarker(line string) (string, bool) {
	trimmed := strings.TrimLeft(line, " \t")
	if !strings.HasPrefix(trimmed, ">") {
		return "", false
	}

	content := strings.TrimPrefix(trimmed, ">")
	if strings.HasPrefix(content, " ") {
		content = content[1:]
	}
	return content, true
}

func parseContainerDirective(line string) (containerDirective, bool) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, ":::") {
		return containerDirective{}, false
	}

	fenceLength := 0
	for fenceLength < len(trimmed) && trimmed[fenceLength] == ':' {
		fenceLength++
	}
	if fenceLength < 3 {
		return containerDirective{}, false
	}

	rest := strings.TrimSpace(trimmed[fenceLength:])
	if rest == "" {
		return containerDirective{}, false
	}

	name, rest, ok := readDirectiveName(rest)
	if !ok {
		return containerDirective{}, false
	}

	title := ""
	rest = strings.TrimSpace(rest)
	if rest != "" {
		if !strings.HasPrefix(rest, "[") || !strings.HasSuffix(rest, "]") {
			return containerDirective{}, false
		}
		title = strings.TrimSpace(rest[1 : len(rest)-1])
	}

	return containerDirective{
		FenceLength: fenceLength,
		Name:        name,
		Title:       title,
	}, true
}

func findContainerEnd(lines []string, start, fenceLength int) int {
	for i := start; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			continue
		}

		count := 0
		for count < len(trimmed) && trimmed[count] == ':' {
			count++
		}
		if count >= fenceLength && strings.TrimSpace(trimmed[count:]) == "" {
			return i
		}
	}
	return -1
}

func parseLeafDirective(line string) (string, map[string]string, bool) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "::") || strings.HasPrefix(trimmed, ":::") {
		return "", nil, false
	}

	name, rest, ok := readDirectiveName(trimmed[2:])
	if !ok {
		return "", nil, false
	}

	rest = strings.TrimSpace(rest)
	if !strings.HasPrefix(rest, "{") || !strings.HasSuffix(rest, "}") {
		return "", nil, false
	}

	attrs, ok := parseDirectiveAttrs(rest[1 : len(rest)-1])
	if !ok {
		return "", nil, false
	}
	return name, attrs, true
}

func readDirectiveName(text string) (string, string, bool) {
	if text == "" || !isDirectiveNameStart(text[0]) {
		return "", text, false
	}

	end := 1
	for end < len(text) && isDirectiveNameChar(text[end]) {
		end++
	}
	return strings.ToLower(text[:end]), text[end:], true
}

func isDirectiveNameStart(ch byte) bool {
	return ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z'
}

func isDirectiveNameChar(ch byte) bool {
	return isDirectiveNameStart(ch) || ch >= '0' && ch <= '9' || ch == '-' || ch == '_'
}

func parseDirectiveAttrs(text string) (map[string]string, bool) {
	attrs := make(map[string]string)
	index := 0

	for index < len(text) {
		index = skipSpaces(text, index)
		if index >= len(text) {
			break
		}
		if !isDirectiveNameStart(text[index]) {
			return nil, false
		}

		keyStart := index
		index++
		for index < len(text) && isDirectiveNameChar(text[index]) {
			index++
		}
		key := strings.ToLower(text[keyStart:index])

		index = skipSpaces(text, index)
		if index >= len(text) || text[index] != '=' {
			return nil, false
		}
		index++
		index = skipSpaces(text, index)
		if index >= len(text) || (text[index] != '"' && text[index] != '\'') {
			return nil, false
		}

		quote := text[index]
		index++
		var value strings.Builder
		for index < len(text) {
			if text[index] == '\\' && index+1 < len(text) {
				index++
				value.WriteByte(text[index])
				index++
				continue
			}
			if text[index] == quote {
				break
			}
			value.WriteByte(text[index])
			index++
		}
		if index >= len(text) || text[index] != quote {
			return nil, false
		}
		index++
		attrs[key] = value.String()
	}

	return attrs, true
}

func skipSpaces(text string, index int) int {
	for index < len(text) && (text[index] == ' ' || text[index] == '\t' || text[index] == '\n' || text[index] == '\r') {
		index++
	}
	return index
}

func markdownFence(line string) (byte, int, bool) {
	trimmed := strings.TrimLeft(line, " \t")
	if len(trimmed) < 3 || (trimmed[0] != '`' && trimmed[0] != '~') {
		return 0, 0, false
	}

	char := trimmed[0]
	length := 0
	for length < len(trimmed) && trimmed[length] == char {
		length++
	}
	if length < 3 {
		return 0, 0, false
	}

	return char, length, true
}

func applyFigureCaptions(html string) string {
	return htmlImageParagraphPattern.ReplaceAllStringFunc(html, func(match string) string {
		parts := htmlImageParagraphPattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}

		imgTags := imgTagPattern.FindAllString(parts[1], -1)
		var builder strings.Builder
		for _, imgTag := range imgTags {
			attrText := imgTagPattern.FindStringSubmatch(imgTag)[1]
			attrs := parseHTMLAttrs(attrText)
			alt := attrs["alt"]

			if strings.HasPrefix(alt, "_") {
				builder.WriteString(`<p><img ` + rewriteImageAlt(attrText, strings.TrimPrefix(alt, "_")) + ` loading="lazy" decoding="async"></p>`)
				continue
			}
			if strings.TrimSpace(alt) == "" {
				builder.WriteString(`<p><img ` + attrText + ` loading="lazy" decoding="async"></p>`)
				continue
			}

			builder.WriteString(`<figure><img ` + attrText + ` loading="lazy" decoding="async"><figcaption>` + stdhtml.EscapeString(alt) + `</figcaption></figure>`)
		}
		return builder.String()
	})
}

func parseHTMLAttrs(text string) map[string]string {
	attrs := make(map[string]string)
	matches := htmlAttrPattern.FindAllStringSubmatch(text, -1)
	for _, match := range matches {
		if len(match) < 4 {
			continue
		}
		value := match[2]
		if value == "" && len(match) >= 4 {
			value = match[3]
		}
		if value == "" && len(match) >= 5 {
			value = match[4]
		}
		attrs[strings.ToLower(match[1])] = stdhtml.UnescapeString(value)
	}
	return attrs
}

func rewriteImageAlt(attrText, alt string) string {
	return htmlAttrPattern.ReplaceAllStringFunc(attrText, func(match string) string {
		parts := htmlAttrPattern.FindStringSubmatch(match)
		if len(parts) < 4 || !strings.EqualFold(parts[1], "alt") {
			return match
		}
		return `alt="` + stdhtml.EscapeString(alt) + `"`
	})
}

func (context *extensionContext) addMathHTML(mathText string, isBlock bool) string {
	id := fmt.Sprintf("DAYBOOK_MATH_PLACEHOLDER_%d_%d_END", context.depth, len(context.mathItems))
	context.mathItems = append(context.mathItems, MathItem{
		ID:          id,
		Tex:         mathText,
		DisplayMode: isBlock,
	})
	return id
}

func extractMath(input string, context *extensionContext) string {
	var builder strings.Builder
	builder.Grow(len(input))
	i := 0

	for i < len(input) {
		if input[i] == '`' || input[i] == '~' {
			char := input[i]
			start := i
			for i < len(input) && input[i] == char {
				i++
			}
			length := i - start

			if length >= 3 {
				closing := findClosingFenceMath(input, i, char, length)
				builder.WriteString(input[start:closing])
				i = closing
				continue
			} else if char == '`' {
				closing := findClosingInlineCodeMath(input, i, length)
				builder.WriteString(input[start:closing])
				i = closing
				continue
			} else {
				builder.WriteString(input[start:i])
				continue
			}
		}

		if input[i] == '\\' && i+1 < len(input) && (input[i+1] == '$' || input[i+1] == '`' || input[i+1] == '\\') {
			builder.WriteByte(input[i])
			builder.WriteByte(input[i+1])
			i += 2
			continue
		}

		if input[i] == '$' {
			if i+1 < len(input) && input[i+1] == '$' {
				start := i
				i += 2
				closing := strings.Index(input[i:], "$$")
				if closing != -1 {
					closing += i
					mathText := input[start+2 : closing]
					builder.WriteString(context.addMathHTML(mathText, true))
					i = closing + 2
					continue
				} else {
					builder.WriteString("$$")
					continue
				}
			}

			start := i
			i++
			valid, closing := isValidInlineMathSpan(input, start)
			if valid {
				mathText := input[start+1 : closing]
				builder.WriteString(context.addMathHTML(mathText, false))
				i = closing + 1
				continue
			} else {
				builder.WriteByte('$')
				continue
			}
		}

		builder.WriteByte(input[i])
		i++
	}
	return builder.String()
}

func findClosingFenceMath(input string, start int, char byte, length int) int {
	for i := start; i < len(input); i++ {
		if input[i] == char {
			matchLen := 0
			for i+matchLen < len(input) && input[i+matchLen] == char {
				matchLen++
			}
			if matchLen >= length {
				return i + matchLen
			}
			i += matchLen - 1
		}
	}
	return len(input)
}

func findClosingInlineCodeMath(input string, start int, length int) int {
	for i := start; i < len(input); i++ {
		if input[i] == '`' {
			matchLen := 0
			for i+matchLen < len(input) && input[i+matchLen] == '`' {
				matchLen++
			}
			if matchLen == length {
				return i + matchLen
			}
			i += matchLen - 1
		}
	}
	return len(input)
}

func isValidInlineMathSpan(input string, start int) (bool, int) {
	if start+1 >= len(input) {
		return false, -1
	}
	if input[start+1] == ' ' || input[start+1] == '\t' || input[start+1] == '\n' {
		return false, -1
	}

	i := start + 1
	for i < len(input) {
		if input[i] == '\\' && i+1 < len(input) && input[i+1] == '$' {
			i += 2
			continue
		}
		if input[i] == '$' {
			if input[i-1] != ' ' && input[i-1] != '\t' && input[i-1] != '\n' && i > start+1 {
				if !strings.Contains(input[start+1:i], "\n\n") {
					return true, i
				}
			}
			return false, -1
		}
		i++
	}
	return false, -1
}
