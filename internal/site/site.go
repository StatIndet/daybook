package site

import (
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"unicode"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/markdown"
	"github.com/StatIndet/daybook/internal/render"
)

type Options struct {
	Config       config.Config
	NotesDir     string
	TemplatesDir string
	StaticDir    string
	PublicDir    string
}

type BuildResult struct {
	Notes   []content.Note
	Skipped []string
}

func Build(options Options) (BuildResult, error) {
	notes, skipped, err := content.LoadNotes(options.NotesDir)
	if err != nil {
		return BuildResult{}, err
	}

	if err := os.RemoveAll(options.PublicDir); err != nil {
		return BuildResult{}, fmt.Errorf("清理 public 目录: %w", err)
	}
	if err := os.MkdirAll(options.PublicDir, 0755); err != nil {
		return BuildResult{}, fmt.Errorf("创建 public 目录: %w", err)
	}

	if err := copyDir(options.StaticDir, options.PublicDir); err != nil {
		return BuildResult{}, err
	}

	renderer := render.New(options.TemplatesDir)
	siteData := render.SiteData{Title: options.Config.Title}

	var noteLinks []render.NoteLink
	for _, note := range notes {
		html, err := markdown.ToHTML(note.Body)
		if err != nil {
			return BuildResult{}, fmt.Errorf("处理笔记 %s: %w", note.SourcePath, err)
		}

		noteLinks = append(noteLinks, render.NoteLink{
			Title:       note.Title,
			Date:        note.Date,
			ReadingTime: estimateReadingTime(note.Body),
			Summary:     note.Summary,
			URL:         note.URL,
		})

		outputPath := filepath.Join(options.PublicDir, "notes", note.Slug, "index.html")
		data := render.NoteData{
			Site:      siteData,
			PageTitle: note.Title,
			Note: render.NotePage{
				Title:   note.Title,
				Date:    note.Date,
				Summary: note.Summary,
				URL:     note.URL,
				HTML:    template.HTML(html),
			},
		}

		if err := renderer.RenderNote(outputPath, data); err != nil {
			return BuildResult{}, fmt.Errorf("生成笔记页面 %s: %w", note.SourcePath, err)
		}
	}

	indexPath := filepath.Join(options.PublicDir, "index.html")
	indexData := render.IndexData{
		Site:      siteData,
		PageTitle: "首页",
		Notes:     noteLinks,
	}
	if err := renderer.RenderIndex(indexPath, indexData); err != nil {
		return BuildResult{}, fmt.Errorf("生成首页: %w", err)
	}

	notesIndexPath := filepath.Join(options.PublicDir, "notes", "index.html")
	notesData := render.NotesData{
		Site:      siteData,
		PageTitle: "文章",
		Notes:     noteLinks,
	}
	if err := renderer.RenderNotes(notesIndexPath, notesData); err != nil {
		return BuildResult{}, fmt.Errorf("生成文章页: %w", err)
	}

	return BuildResult{Notes: notes, Skipped: skipped}, nil
}

func estimateReadingTime(text string) string {
	units := 0
	inWord := false

	for _, r := range text {
		if unicode.Is(unicode.Han, r) {
			units++
			inWord = false
			continue
		}

		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			if !inWord {
				units++
			}
			inWord = true
			continue
		}

		inWord = false
	}

	minutes := (units + 399) / 400
	if minutes < 1 {
		minutes = 1
	}

	return fmt.Sprintf("%d min", minutes)
}

func Serve(publicDir, address string) error {
	if _, err := os.Stat(publicDir); err != nil {
		return fmt.Errorf("找不到 public 目录，请先运行 go run ./cmd/daybook build: %w", err)
	}

	fileServer := http.FileServer(http.Dir(publicDir))
	mux := http.NewServeMux()
	mux.Handle("/", fileServer)

	if err := http.ListenAndServe(address, mux); err != nil {
		return fmt.Errorf("启动预览服务器: %w", err)
	}

	return nil
}

func copyDir(sourceDir, targetDir string) error {
	if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf("读取 static 目录: %w", err)
	}

	return filepath.WalkDir(sourceDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("读取 static 路径 %s: %w", path, err)
		}

		relativePath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return fmt.Errorf("计算 static 相对路径: %w", err)
		}
		targetPath := filepath.Join(targetDir, relativePath)

		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0755)
		}
		if !entry.Type().IsRegular() {
			return nil
		}

		return copyFile(path, targetPath)
	})
}

func copyFile(sourcePath, targetPath string) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("创建 static 输出目录: %w", err)
	}

	source, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("打开 static 文件: %w", err)
	}
	defer source.Close()

	target, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("创建 static 输出文件: %w", err)
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		return fmt.Errorf("复制 static 文件: %w", err)
	}

	return nil
}
