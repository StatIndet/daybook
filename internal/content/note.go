package content

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
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
	Math           bool
	Pinned         bool
	HasMusic       bool
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
	Section        string
	Location       string
	// Frontmatter is retained only for explicit graph search property exports.
	// It must never be serialized wholesale into a public artifact.
	Frontmatter map[string]any `json:"-"`
}

type frontmatter struct {
	Date     string   `yaml:"date"`
	Updated  string   `yaml:"updated"`
	Lang     string   `yaml:"lang"`
	I18nKey  string   `yaml:"i18n_key"`
	Tags     []string `yaml:"tags"`
	Summary  string   `yaml:"summary"`
	Draft    bool     `yaml:"draft"`
	Math     bool     `yaml:"math"`
	Pinned   bool     `yaml:"pinned"`
	Toc      *bool    `yaml:"toc"`
	Comment  *bool    `yaml:"comment"`
	Location string   `yaml:"location"`
}

func LoadNotes(dir string) ([]*ArticleGroup, []string, error) {
	return loadSection(dir, "notes")
}

// LoadMemos loads the optional memos directory with the same publishing rules
// as notes. Existing vaults without memos continue to build unchanged.
func LoadMemos(dir string) ([]*ArticleGroup, []string, error) {
	return loadSection(dir, "memos")
}

func loadSection(dir, section string) ([]*ArticleGroup, []string, error) {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil, nil
	}
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

		if strings.HasPrefix(slug, "page/") || slug == "page" {
			return fmt.Errorf("\"page\" is reserved for Daybook pagination. Conflict: %s", path)
		}

		note, err := parseSectionFile(path, slug, section)
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
	return parseSectionFile(path, slug, "notes")
}

func parseSectionFile(path, slug, section string) (Note, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Note{}, fmt.Errorf("读取笔记文件: %w", err)
	}

	return ParseSection(path, string(data), slug, section)
}

func Parse(sourcePath, text string, slug string) (Note, error) {
	return ParseSection(sourcePath, text, slug, "notes")
}

func ParseMemo(sourcePath, text, slug string) (Note, error) {
	return ParseSection(sourcePath, text, slug, "memos")
}

func ParseSection(sourcePath, text, slug, section string) (Note, error) {
	if section != "notes" && section != "memos" {
		return Note{}, fmt.Errorf("未知内容目录: %s", section)
	}
	yamlText, body, bodyStartLine, ok := splitFrontmatter(text)
	if !ok {
		return Note{}, fmt.Errorf("缺少 YAML frontmatter")
	}

	var meta frontmatter
	if err := yaml.Unmarshal([]byte(yamlText), &meta); err != nil {
		return Note{}, fmt.Errorf("解析 YAML frontmatter: %w", err)
	}
	var properties map[string]any
	if err := yaml.Unmarshal([]byte(yamlText), &properties); err != nil {
		return Note{}, fmt.Errorf("解析 YAML frontmatter: %w", err)
	}

	note := Note{
		Title:         titleFromFilename(sourcePath, slug),
		Date:          strings.TrimSpace(meta.Date),
		Updated:       strings.TrimSpace(meta.Updated),
		Slug:          slug,
		Lang:          strings.TrimSpace(meta.Lang),
		I18nKey:       strings.TrimSpace(meta.I18nKey),
		Tags:          meta.Tags,
		Summary:       strings.TrimSpace(meta.Summary),
		Draft:         meta.Draft,
		Math:          meta.Math,
		Pinned:        meta.Pinned,
		HasMusic:      strings.Contains(cleanBody(body), "::music{"),
		Toc:           meta.Toc,
		Comment:       meta.Comment,
		Body:          body,
		BodyStartLine: bodyStartLine,
		SourcePath:    sourcePath,
		Section:       section,
		Location:      strings.TrimSpace(meta.Location),
		Frontmatter:   properties,
	}

	if note.Draft {
		return note, nil
	}

	if note.Lang == "" {
		note.Lang = "zh_CN"
	}

	prefix := ""
	if note.Lang == "en_US" {
		prefix = "/en_US"
	}
	note.URL = prefix + "/" + section + "/" + note.Slug + "/"
	note.CanonicalPath = note.URL

	if section != "memos" {
		note.WordCount = countWords(note.Body)
		note.ReadingMinutes = int(math.Max(1, math.Ceil(float64(note.WordCount)/300.0)))
	}

	if err := validate(note); err != nil {
		return Note{}, err
	}

	return note, nil
}

func titleFromFilename(sourcePath, slug string) string {
	name := filepath.Base(sourcePath)
	if sourcePath == "" || name == "." {
		name = filepath.Base(slug)
		return name
	}
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// ParseDate accepts a calendar date or an RFC3339 timestamp with an explicit
// timezone. Keeping the original string preserves the author's local time.
func ParseDate(value string) (time.Time, error) {
	if date, err := time.Parse(time.DateOnly, value); err == nil {
		return date, nil
	}
	return time.Parse(time.RFC3339, value)
}

// CompareDates orders publication instants, including timestamps with different
// UTC offsets. The lexical fallback also supports optional legacy updated values.
func CompareDates(a, b string) int {
	ta, errA := ParseDate(a)
	tb, errB := ParseDate(b)
	if errA != nil || errB != nil {
		return strings.Compare(a, b)
	}
	return ta.Compare(tb)
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
	if note.Date == "" {
		return fmt.Errorf("缺少必填字段 date")
	}
	if _, err := ParseDate(note.Date); err != nil {
		return fmt.Errorf("date 必须是有效的 YYYY-MM-DD 日期或带时区的 RFC3339 时间，当前为 %q", note.Date)
	}
	if note.Lang != "zh_CN" && note.Lang != "en_US" {
		return fmt.Errorf("lang 必须是 zh_CN 或 en_US，当前为 %s", note.Lang)
	}
	if note.Section == "memos" && note.Updated != "" {
		if _, err := ParseDate(note.Updated); err != nil {
			return fmt.Errorf("updated 必须是有效的 YYYY-MM-DD 日期或带时区的 RFC3339 时间，当前为 %q", note.Updated)
		}
	}

	return nil
}

func cleanBody(text string) string {
	reCodeBlock := regexp.MustCompile("(?s)```.*?```")
	text = reCodeBlock.ReplaceAllString(text, "")

	reMathBlock := regexp.MustCompile(`(?s)\$\$.*?\$\$`)
	text = reMathBlock.ReplaceAllString(text, "")

	reInlineCode := regexp.MustCompile("(?s)`.*?`")
	text = reInlineCode.ReplaceAllString(text, "")

	reHTML := regexp.MustCompile(`(?s)<.*?>`)
	text = reHTML.ReplaceAllString(text, "")

	return text
}

func countWords(text string) int {
	text = cleanBody(text)

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
