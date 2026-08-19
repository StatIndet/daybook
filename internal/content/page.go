package content

import (
	"fmt"
	"math"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type Page struct {
	Title          string
	Date           string
	Updated        string
	Summary        string
	Draft          bool
	Body           string
	BodyStartLine  int
	SourcePath     string
	WordCount      int
	ReadingMinutes int
}

type pageFrontmatter struct {
	Title   string `yaml:"title"`
	Date    string `yaml:"date"`
	Updated string `yaml:"updated"`
	Summary string `yaml:"summary"`
	Draft   bool   `yaml:"draft"`
}

func ParsePageFile(path string) (Page, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Page{}, fmt.Errorf("读取页面文件: %w", err)
	}

	return ParsePage(path, string(data))
}

func ParsePage(sourcePath, text string) (Page, error) {
	yamlText, body, bodyStartLine, ok := splitFrontmatter(text)
	if !ok {
		return Page{}, fmt.Errorf("缺少 YAML frontmatter")
	}

	var meta pageFrontmatter
	if err := yaml.Unmarshal([]byte(yamlText), &meta); err != nil {
		return Page{}, fmt.Errorf("解析 YAML frontmatter: %w", err)
	}

	page := Page{
		Title:         strings.TrimSpace(meta.Title),
		Date:          strings.TrimSpace(meta.Date),
		Updated:       strings.TrimSpace(meta.Updated),
		Summary:       strings.TrimSpace(meta.Summary),
		Draft:         meta.Draft,
		Body:          body,
		BodyStartLine: bodyStartLine,
		SourcePath:    sourcePath,
	}

	page.WordCount = countWords(page.Body)
	page.ReadingMinutes = int(math.Max(1, math.Ceil(float64(page.WordCount)/300.0)))

	if page.Title == "" {
		return Page{}, fmt.Errorf("缺少必填字段 title")
	}

	return page, nil
}
