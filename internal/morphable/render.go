package morphable

import (
	"bytes"
	"fmt"
	"html"
	"html/template"

	"github.com/rivo/uniseg"
)

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
		if inline {
			buf.WriteString(fmt.Sprintf(`<span class="%s-glyph" style="view-transition-name: %s-glyph-%d" data-glyph-index="%d">%s</span>`, classPrefix, classPrefix, index, index, html.EscapeString(grapheme)))
		} else {
			buf.WriteString(fmt.Sprintf(`<span class="%s-glyph" data-glyph-index="%d">%s</span>`, classPrefix, index, html.EscapeString(grapheme)))
		}
		index++
	}

	buf.WriteString("</span>")
	return template.HTML(buf.String())
}
