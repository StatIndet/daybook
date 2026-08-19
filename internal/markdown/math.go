package markdown

import (
	
	
	
	"os"
	"strings"
		"path/filepath"
)

type MathItem struct {
	ID          string `json:"id"`
	Tex         string `json:"tex"`
	DisplayMode bool   `json:"displayMode"`
}

type MathRenderResult struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	HTML  string `json:"html"`
	Error string `json:"error"`
}

var projectRoot string

func init() {
	projectRoot = findProjectRoot()
}

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

func renderMathBlocks(items []MathItem) ([]MathRenderResult, error) {
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
}
