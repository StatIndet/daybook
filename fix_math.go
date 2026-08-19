package main

import (
	"os"
	"strings"
)

func main() {
	content, _ := os.ReadFile("internal/markdown/math.go")
	s := string(content)

	old_func_start := "func renderMathBlocks(items []MathItem) ([]MathRenderResult, error) {"
	old_func_end := "	return results, nil\n}"
	
	start_idx := strings.Index(s, old_func_start)
	end_idx := strings.Index(s[start_idx:], old_func_end) + start_idx + len(old_func_end)

	new_func := `func renderMathBlocks(items []MathItem) ([]MathRenderResult, error) {
	if len(items) == 0 {
		return nil, nil
	}
	var results []MathRenderResult
	for _, item := range items {
		var html string
		if item.DisplayMode {
			html = "<div class=\"math math-display\">$$" + escapeHtml(item.Tex) + "$$</div>"
		} else {
			html = "<span class=\"math math-inline\">\\(" + escapeHtml(item.Tex) + "\\)</span>"
		}
		results = append(results, MathRenderResult{
			ID:    item.ID,
			OK:    true,
			HTML:  html,
			Error: "",
		})
	}
	return results, nil
}

func escapeHtml(value string) string {
	s := strings.ReplaceAll(value, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&#39;")
	return s
}`
	s = s[:start_idx] + new_func + s[end_idx:]

	// Remove os/exec import
	s = strings.ReplaceAll(s, "\"os/exec\"\n", "")

	os.WriteFile("internal/markdown/math.go", []byte(s), 0644)
}
