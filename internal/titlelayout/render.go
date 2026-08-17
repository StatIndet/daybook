package titlelayout

import (
	"bytes"
	"fmt"
	"html"
	"html/template"

	"github.com/rivo/uniseg"
)

func GenerateHTML(title string, slug string) template.HTML {
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf(`<span class="article-title--morphable" data-title-id="%s">`, html.EscapeString(slug)))

	gr := uniseg.NewGraphemes(title)
	index := 0
	for gr.Next() {
		grapheme := gr.Str()
		buf.WriteString(fmt.Sprintf(`<span class="title-glyph" data-glyph-index="%d">%s</span>`, index, html.EscapeString(grapheme)))
		index++
	}

	buf.WriteString("</span>")
	return template.HTML(buf.String())
}
