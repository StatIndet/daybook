package markdown

import (
	"bytes"
	"fmt"

	"github.com/yuin/goldmark"
)

func ToHTML(text string) (string, error) {
	var output bytes.Buffer

	if err := goldmark.Convert([]byte(text), &output); err != nil {
		return "", fmt.Errorf("转换 Markdown: %w", err)
	}

	return output.String(), nil
}
