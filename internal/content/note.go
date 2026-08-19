package content

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

type Note struct {
	Title          string
	Date           string
	Updated        string
	Slug           string
	Tags           []string
	Summary        string
	Draft          bool
	Listed         *bool
	Math           bool
	Pin            bool
	Body           string
	BodyStartLine  int
	URL            string
	SourcePath     string
	Toc            *bool
	Comment        *bool
	WordCount      int
	ReadingMinutes int
	Lang           string
	I18nKey        string
	CanonicalPath  string
}

type frontmatter struct {
	Title   string   `yaml:"title"`
	Date    string   `yaml:"date"`
	Updated string   `yaml:"updated"`
	Lang    string   `yaml:"lang"`
	I18nKey string   `yaml:"i18n_key"`
	Listed  *bool    `yaml:"listed"`
	Tags    []string `yaml:"tags"`
	Summary string   `yaml:"summary"`
	Draft   bool     `yaml:"draft"`
	Math    bool     `yaml:"math"`
	Pin     bool     `yaml:"pin"`
	Toc     *bool    `yaml:"toc"`
	Comment *bool    `yaml:"comment"`
}

func LoadNotes(dir string) ([]*ArticleGroup, []string, error) {
	var notes []Note
	var skipped []string
	seenSlugs := make(map[string]string) // "lang:slug" -> path

	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("读取路径 %s: %w", path, err)
		}
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(path), ".md") {
			return nil
		}

		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return fmt.Errorf("计算相对路径 %s: %w", path, err)
		}
		rel = filepath.ToSlash(rel)
		slug := strings.TrimSuffix(rel, filepath.Ext(rel))

		note, err := ParseFile(path, slug)
		if err != nil {
			skipped = append(skipped, fmt.Sprintf("%s (%v)", path, err))
			return nil
		}
		if note.Draft {
			return nil
		}

		key := note.Lang + ":" + note.Slug
		if otherPath, ok := seenSlugs[key]; ok {
			return fmt.Errorf("URL 冲突: %s 环境下 slug %s 同时出现在 %s 和 %s", note.Lang, note.Slug, otherPath, path)
		}
		seenSlugs[key] = path

		notes = append(notes, note)
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("遍历笔记目录: %w", err)
	}

	groups, err := GroupNotes(notes)
	if err != nil {
		return nil, nil, err
	}

	return groups, skipped, nil
}

func ParseFile(path string, slug string) (Note, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Note{}, fmt.Errorf("读取笔记文件: %w", err)
	}

	return Parse(path, string(data), slug)
}

func Parse(sourcePath, text string, slug string) (Note, error) {
	yamlText, body, bodyStartLine, ok := splitFrontmatter(text)
	if !ok {
		return Note{}, fmt.Errorf("缺少 YAML frontmatter")
	}

	var meta frontmatter
	if err := yaml.Unmarshal([]byte(yamlText), &meta); err != nil {
		return Note{}, fmt.Errorf("解析 YAML frontmatter: %w", err)
	}

	note := Note{
		Title:         strings.TrimSpace(meta.Title),
		Date:          strings.TrimSpace(meta.Date),
		Updated:       strings.TrimSpace(meta.Updated),
		Slug:          slug,
		Lang:          strings.TrimSpace(meta.Lang),
		I18nKey:       strings.TrimSpace(meta.I18nKey),
		Tags:          meta.Tags,
		Summary:       strings.TrimSpace(meta.Summary),
		Draft:         meta.Draft,
		Listed:        meta.Listed,
		Math:          meta.Math,
		Pin:           meta.Pin,
		Toc:           meta.Toc,
		Comment:       meta.Comment,
		Body:          body,
		BodyStartLine: bodyStartLine,
		SourcePath:    sourcePath,
	}
	note.URL = "/notes/" + note.Slug + "/"
	note.CanonicalPath = "/notes/" + note.Slug + "/"

	if note.Lang == "" {
		note.Lang = "zh-CN"
	}

	note.WordCount = countWords(note.Body)
	note.ReadingMinutes = int(math.Max(1, math.Ceil(float64(note.WordCount)/300.0)))

	if err := validate(note); err != nil {
		return Note{}, err
	}

	return note, nil
}

func splitFrontmatter(text string) (string, string, int, bool) {
	// split on "\n" directly will lose \r, let's just split by "\n"
	lines := strings.Split(text, "\n")
	if len(lines) < 3 || strings.TrimSpace(lines[0]) != "---" {
		return "", strings.TrimSpace(text), 1, false
	}

	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			// Find actual start line of body by skipping leading blank lines
			startLineOffset := 0
			bodyLines := lines[i+1:]
			for startLineOffset < len(bodyLines) && strings.TrimSpace(bodyLines[startLineOffset]) == "" {
				startLineOffset++
			}
			body := strings.Join(bodyLines[startLineOffset:], "\n")
			body = strings.TrimRight(body, " \t\r\n") // Only trim trailing, leading is already handled
			
			// body starts at line i+2+startLineOffset (1-based index)
			return strings.Join(lines[1:i], "\n"), body, i + 2 + startLineOffset, true
		}
	}

	return "", strings.TrimSpace(text), 1, false
}

func validate(note Note) error {
	if note.Title == "" {
		return fmt.Errorf("缺少必填字段 title")
	}
	if note.Date == "" {
		return fmt.Errorf("缺少必填字段 date")
	}
	if note.Lang != "zh-CN" && note.Lang != "en" {
		return fmt.Errorf("lang 必须是 zh-CN 或 en，当前为 %s", note.Lang)
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
