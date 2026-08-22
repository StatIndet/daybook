package morphable

import (
	"bytes"
	"fmt"
	"html"
	"html/template"
	"unicode"

	"github.com/rivo/uniseg"
)

func isWhitespaceGrapheme(grapheme string) bool {
	if len(grapheme) == 0 {
		return false
	}
	for _, r := range grapheme {
		if !unicode.IsSpace(r) {
			return false
		}
	}
	return true
}

func GenerateHTML(text, transitionKey, classPrefix string, inlineStyles ...bool) template.HTML {
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf(`<span class="%s-morphable" data-%s-transition-key="%s">`, classPrefix, classPrefix, html.EscapeString(transitionKey)))

	gr := uniseg.NewGraphemes(text)
	index := 0
	inline := false
	if len(inlineStyles) > 0 {
		inline = inlineStyles[0]
	}

	for gr.Next() {
		grapheme := gr.Str()
		if isWhitespaceGrapheme(grapheme) {
			buf.WriteString(html.EscapeString(grapheme))
		} else {
			if inline {
				buf.WriteString(fmt.Sprintf(`<span class="%s-glyph" style="view-transition-name: %s-glyph-%d" data-glyph-index="%d">%s</span>`, classPrefix, classPrefix, index, index, html.EscapeString(grapheme)))
			} else {
				buf.WriteString(fmt.Sprintf(`<span class="%s-glyph" data-glyph-index="%d">%s</span>`, classPrefix, index, html.EscapeString(grapheme)))
			}
		}
		index++
	}

	buf.WriteString("</span>")
	return template.HTML(buf.String())
}
