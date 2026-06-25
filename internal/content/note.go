package content

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

type Note struct {
	Title      string
	Date       string
	Updated    string
	Slug       string
	Tags       []string
	Summary    string
	Draft      bool
	Math       bool
	Pin        bool
	Body       string
	URL        string
	SourcePath string
	Toc            *bool
	Comment        *bool
	WordCount      int
	ReadingMinutes int
	CanonicalPath  string
}

type frontmatter struct {
	Title   string   `yaml:"title"`
	Date    string   `yaml:"date"`
	Updated string   `yaml:"updated"`
	Slug    string   `yaml:"slug"`
	Tags    []string `yaml:"tags"`
	Summary string   `yaml:"summary"`
	Draft   bool     `yaml:"draft"`
	Math    bool     `yaml:"math"`
	Pin     bool     `yaml:"pin"`
	Toc     *bool    `yaml:"toc"`
	Comment *bool    `yaml:"comment"`
}

func LoadNotes(dir string) ([]Note, []string, error) {
	var notes []Note
	var skipped []string
	seenSlugs := make(map[string]string)

	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("读取路径 %s: %w", path, err)
		}
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(path), ".md") {
			return nil
		}

		note, err := ParseFile(path)
		if err != nil {
			skipped = append(skipped, fmt.Sprintf("%s (%v)", path, err))
			return nil
		}
		if note.Draft {
			return nil
		}

		if otherPath, ok := seenSlugs[note.Slug]; ok {
			return fmt.Errorf("slug 重复: %s 同时出现在 %s 和 %s", note.Slug, otherPath, path)
		}
		seenSlugs[note.Slug] = path

		notes = append(notes, note)
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("遍历笔记目录: %w", err)
	}

	sort.SliceStable(notes, func(i, j int) bool {
		if notes[i].Date == notes[j].Date {
			return notes[i].Title < notes[j].Title
		}
		return notes[i].Date > notes[j].Date
	})

	return notes, skipped, nil
}

func ParseFile(path string) (Note, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Note{}, fmt.Errorf("读取笔记文件: %w", err)
	}

	return Parse(path, string(data))
}

func Parse(sourcePath, text string) (Note, error) {
	yamlText, body, ok := splitFrontmatter(text)
	if !ok {
		return Note{}, fmt.Errorf("缺少 YAML frontmatter")
	}

	var meta frontmatter
	if err := yaml.Unmarshal([]byte(yamlText), &meta); err != nil {
		return Note{}, fmt.Errorf("解析 YAML frontmatter: %w", err)
	}

	note := Note{
		Title:      strings.TrimSpace(meta.Title),
		Date:       strings.TrimSpace(meta.Date),
		Updated:    strings.TrimSpace(meta.Updated),
		Slug:       strings.TrimSpace(meta.Slug),
		Tags:       meta.Tags,
		Summary:    strings.TrimSpace(meta.Summary),
		Draft:      meta.Draft,
		Math:       meta.Math,
		Pin:        meta.Pin,
		Toc:        meta.Toc,
		Comment:    meta.Comment,
		Body:       strings.TrimSpace(body),
		SourcePath: sourcePath,
	}
	note.URL = "/notes/" + note.Slug + "/"
	note.CanonicalPath = "/notes/" + note.Slug + "/"
	note.WordCount = countWords(note.Body)
	note.ReadingMinutes = int(math.Max(1, math.Ceil(float64(note.WordCount)/300.0)))

	if err := validate(note); err != nil {
		return Note{}, err
	}

	return note, nil
}

func splitFrontmatter(text string) (string, string, bool) {
	lines := strings.Split(text, "\n")
	if len(lines) < 3 || strings.TrimSpace(lines[0]) != "---" {
		return "", text, false
	}

	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			return strings.Join(lines[1:i], "\n"), strings.Join(lines[i+1:], "\n"), true
		}
	}

	return "", text, false
}

func validate(note Note) error {
	if note.Title == "" {
		return fmt.Errorf("缺少必填字段 title")
	}
	if note.Date == "" {
		return fmt.Errorf("缺少必填字段 date")
	}
	if note.Slug == "" {
		return fmt.Errorf("缺少必填字段 slug")
	}
	if strings.Contains(note.Slug, "/") || strings.Contains(note.Slug, "\\") || strings.Contains(note.Slug, "..") {
		return fmt.Errorf("slug 不能包含路径分隔符或 ..")
	}

	return nil
}

func countWords(text string) int {
	reCodeBlock := regexp.MustCompile("(?s)```.*?```")
	text = reCodeBlock.ReplaceAllString(text, "")

	reMathBlock := regexp.MustCompile(`(?s)\$\$.*?\$\$`)
	text = reMathBlock.ReplaceAllString(text, "")

	reInlineCode := regexp.MustCompile("(?s)`.*?`")
	text = reInlineCode.ReplaceAllString(text, "")

	reHTML := regexp.MustCompile(`(?s)<.*?>`)
	text = reHTML.ReplaceAllString(text, "")

	reLink := regexp.MustCompile(`!?\[(.*?)\]\(.*?\)`)
	text = reLink.ReplaceAllString(text, "$1")

	reFormat := regexp.MustCompile(`[#*_=~>|-]+`)
	text = reFormat.ReplaceAllString(text, " ")

	count := 0
	inWord := false
	for _, r := range text {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) {
			count++
			inWord = false
		} else if unicode.IsLetter(r) || unicode.IsNumber(r) {
			if !inWord {
				count++
				inWord = true
			}
		} else {
			inWord = false
		}
	}
	return count
}
