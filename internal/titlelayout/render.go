package titlelayout

import (
	"bytes"
	"fmt"
	"html"
	"html/template"
)

func GenerateHTML(title string, slug string) template.HTML {
	tokens := Tokenize(title)

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf(`<span class="article-title--morphable" data-title-id="%s">`, html.EscapeString(slug)))

	for i, token := range tokens {
		buf.WriteString(fmt.Sprintf(`<span class="title-token" data-token="%d">%s</span>`, token.Index, html.EscapeString(token.Text)))
		// Insert <wbr> after every token except the last one to allow browser wrapping
		if i < len(tokens)-1 {
			buf.WriteString("<wbr>")
		}
	}

	buf.WriteString("</span>")
	return template.HTML(buf.String())
}
