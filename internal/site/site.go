package site

import (
	"fmt"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/feed"
	"github.com/StatIndet/daybook/internal/graph"
	"github.com/StatIndet/daybook/internal/markdown"
	"github.com/StatIndet/daybook/internal/obsidian"
	"github.com/StatIndet/daybook/internal/render"
	"github.com/StatIndet/daybook/internal/search"
	"github.com/StatIndet/daybook/internal/titlelayout"
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
	tagLinks := collectTagLinks(notes)

	if err := os.RemoveAll(options.PublicDir); err != nil {
		return BuildResult{}, fmt.Errorf("清理 public 目录: %w", err)
	}
	if err := os.MkdirAll(options.PublicDir, 0755); err != nil {
		return BuildResult{}, fmt.Errorf("创建 public 目录: %w", err)
	}

	if err := copyStaticDir(options.StaticDir, options.PublicDir); err != nil {
		return BuildResult{}, err
	}
	assets, err := buildAssets(options.StaticDir, options.PublicDir)
	if err != nil {
		return BuildResult{}, err
	}
	if err := copyNotesAssets(options.NotesDir, options.PublicDir); err != nil {
		return BuildResult{}, err
	}

	renderer := render.New(options.TemplatesDir)
	siteData := render.SiteData{Title: options.Config.Title}
	obsidianIndex, err := buildObsidianIndex(notes)
	if err != nil {
		return BuildResult{}, err
	}

	var graphNodes []graph.InputNode
	var graphLinks []graph.InputLink

	var noteLinks []render.NoteLink
	for _, note := range notes {
		processed := obsidian.Process(note.Body, obsidianIndex)
		document, err := markdown.ToHTMLWithHeadings(processed.Text)
		if err != nil {
			return BuildResult{}, fmt.Errorf("处理笔记 %s: %w", note.SourcePath, err)
		}
		document.HTML = obsidian.RestoreHTML(document.HTML, processed.HTML)
		readingTime := estimateReadingTime(note.Body)
		titleTransitionName := transitionName("note-title", note.Slug)
		dateTransitionName := transitionName("note-date", note.Slug)
		tags := cleanTags(note.Tags)

		graphNodes = append(graphNodes, graph.InputNode{
			ID:    note.Slug,
			Title: note.Title,
			URL:   note.URL,
			Tags:  tags,
			Date:  note.Date,
		})

		for _, link := range processed.Links {
			targetID := link.Slug
			if !link.Exists {
				targetID = link.Target
			}
			graphLinks = append(graphLinks, graph.InputLink{
				Source: note.Slug,
				Target: targetID,
				Exists: link.Exists,
			})
		}

		titleLayoutHTML := titlelayout.GenerateHTML(note.Title, note.Slug)

		noteLinks = append(noteLinks, render.NoteLink{
			Title:               note.Title,
			Date:                note.Date,
			ReadingTime:         readingTime,
			Summary:             note.Summary,
			Tags:                tags,
			URL:                 note.URL,
			Slug:                note.Slug,
			Pin:                 note.Pin,
			TitleLayout:         titleLayoutHTML,
			TitleTransitionName: titleTransitionName,
			DateTransitionName:  dateTransitionName,
		})

		commentEnabled := options.Config.Comment.Enabled
		if note.Comment != nil {
			commentEnabled = *note.Comment
		}

		tocEnabled := true
		if note.Toc != nil {
			tocEnabled = *note.Toc
		}

		outputPath := filepath.Join(options.PublicDir, "notes", note.Slug, "index.html")
		data := render.NoteData{
			Site:      siteData,
			Config:    options.Config,
			PageTitle: note.Title,
			PageKind:  "note",
			BodyClass: "note-body page-body",
			Assets:    assets,
			HasMath:   note.Math,
			Tags:      tagLinks,
			Note: render.NotePage{
				Title:               note.Title,
				Date:                note.Date,
				ReadingTime:         readingTime,
				Summary:             note.Summary,
				URL:                 note.URL,
				Slug:                note.Slug,
				Tags:                tags,
				HTML:                template.HTML(document.HTML),
				Headings:            renderHeadings(document.Headings),
				HasMermaid:          document.HasMermaid,
				HasMath:             note.Math,
				TocEnabled:          tocEnabled,
				CommentEnabled:      commentEnabled,
				TitleLayout:         titleLayoutHTML,
				TitleTransitionName: titleTransitionName,
				DateTransitionName:  dateTransitionName,
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
		PageKind:  "home",
		BodyClass: "home-body",
		Assets:    assets,
		Notes:     noteLinks,
		Tags:      tagLinks,
	}
	if err := renderer.RenderIndex(indexPath, indexData); err != nil {
		return BuildResult{}, fmt.Errorf("生成首页: %w", err)
	}

	var pinnedNotes []render.NoteLink
	var regularNotes []render.NoteLink
	for _, link := range noteLinks {
		if link.Pin {
			pinnedNotes = append(pinnedNotes, link)
		} else {
			regularNotes = append(regularNotes, link)
		}
	}

	notesIndexPath := filepath.Join(options.PublicDir, "notes", "index.html")
	notesData := render.NotesData{
		Site:        siteData,
		PageTitle:   "文章",
		PageKind:    "notes",
		BodyClass:   "notes-list-body page-body",
		Assets:      assets,
		Notes:       noteLinks,
		PinnedNotes: pinnedNotes,
		MonthGroups: monthGroups(regularNotes),
		Tags:        tagLinks,
	}
	if err := renderer.RenderNotes(notesIndexPath, notesData); err != nil {
		return BuildResult{}, fmt.Errorf("生成文章页: %w", err)
	}

	archivePath := filepath.Join(options.PublicDir, "archive", "index.html")
	archiveData := render.ArchiveData{
		Site:       siteData,
		PageTitle:  "归档",
		PageKind:   "archive",
		BodyClass:  "archive-body page-body",
		Assets:     assets,
		Total:      len(noteLinks),
		YearGroups: archiveYearGroups(noteLinks),
		Tags:       tagLinks,
	}
	if err := renderer.RenderArchive(archivePath, archiveData); err != nil {
		return BuildResult{}, fmt.Errorf("生成归档页: %w", err)
	}

	aboutPage, err := content.ParsePageFile(filepath.Join(filepath.Dir(options.NotesDir), "pages", "about.md"))
	if err != nil {
		return BuildResult{}, fmt.Errorf("读取关于页: %w", err)
	}
	aboutProcessed := obsidian.Process(aboutPage.Body, obsidianIndex)
	aboutDocument, err := markdown.ToHTMLWithHeadings(aboutProcessed.Text)
	if err != nil {
		return BuildResult{}, fmt.Errorf("处理关于页: %w", err)
	}
	aboutDocument.HTML = obsidian.RestoreHTML(aboutDocument.HTML, aboutProcessed.HTML)

	aboutPath := filepath.Join(options.PublicDir, "about", "index.html")
	aboutData := render.AboutData{
		Site:      siteData,
		PageTitle: aboutPage.Title,
		PageKind:  "about",
		BodyClass: "about-body page-body",
		Assets:    assets,
		Spiral:    render.NewGoldenSpiral(),
		Title:     aboutPage.Title,
		Summary:   aboutPage.Summary,
		HTML:      template.HTML(aboutDocument.HTML),
		Tags:      tagLinks,
	}
	if err := renderer.RenderAbout(aboutPath, aboutData); err != nil {
		return BuildResult{}, fmt.Errorf("生成关于页: %w", err)
	}

	graphJSONPath := filepath.Join(options.PublicDir, "graph.json")
	if err := graph.BuildJSON(graphNodes, graphLinks, graphJSONPath); err != nil {
		return BuildResult{}, fmt.Errorf("生成 graph.json: %w", err)
	}

	graphPath := filepath.Join(options.PublicDir, "graph", "index.html")
	graphData := render.GraphData{
		Site:      siteData,
		PageTitle: "关系图谱",
		PageKind:  "graph",
		BodyClass: "graph-body page-body",
		Assets:    assets,
		Tags:      tagLinks,
	}
	if err := renderer.RenderGraph(graphPath, graphData); err != nil {
		return BuildResult{}, fmt.Errorf("生成图谱页: %w", err)
	}

	if err := feed.Write(filepath.Join(options.PublicDir, "rss.xml"), options.Config, notes); err != nil {
		return BuildResult{}, err
	}

	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
	if err := search.BuildIndex(notes, estimateReadingTime, searchJSONPath); err != nil {
		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
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

func archiveYearGroups(notes []render.NoteLink) []render.ArchiveYearGroup {
	groups := make([]render.ArchiveYearGroup, 0)
	currentYear := ""

	for index, note := range notes {
		year := note.Date
		if len(year) > 4 {
			year = year[:4]
		}

		if year != currentYear {
			groups = append(groups, render.ArchiveYearGroup{
				Year:  year,
				Notes: []render.ArchiveNote{},
			})
			currentYear = year
		}

		groups[len(groups)-1].Notes = append(groups[len(groups)-1].Notes, render.ArchiveNote{
			Index:       index,
			Title:       note.Title,
			Date:        note.Date,
			DateShort:   archiveDateShort(note.Date),
			ReadingTime: note.ReadingTime,
			Summary:     note.Summary,
			URL:         note.URL,
		})
	}

	return groups
}

func monthGroups(notes []render.NoteLink) []render.MonthGroup {
	groups := make([]render.MonthGroup, 0)
	currentMonth := ""

	for _, note := range notes {
		month := note.Date
		if len(month) >= 7 {
			month = month[:7]
		}

		if month != currentMonth {
			groups = append(groups, render.MonthGroup{
				Key:   month,
				Label: monthLabel(month),
				Notes: []render.NoteLink{},
			})
			currentMonth = month
		}

		groups[len(groups)-1].Notes = append(groups[len(groups)-1].Notes, note)
	}

	return groups
}

func collectTagLinks(notes []content.Note) []render.TagLink {
	namesByKey := make(map[string]string)
	names := make([]string, 0)

	for _, note := range notes {
		for _, tag := range cleanTags(note.Tags) {
			key := strings.ToLower(tag)
			if _, ok := namesByKey[key]; ok {
				continue
			}
			namesByKey[key] = tag
			names = append(names, tag)
		}
	}

	sort.SliceStable(names, func(i, j int) bool {
		left := strings.ToLower(names[i])
		right := strings.ToLower(names[j])
		if left == right {
			return names[i] < names[j]
		}
		return left < right
	})

	links := make([]render.TagLink, 0, len(names))
	for index, name := range names {
		links = append(links, render.TagLink{
			Name:         name,
			URL:          "/notes/?tag=" + url.QueryEscape(name),
			Index:        index,
			ReverseIndex: len(names) - index - 1,
		})
	}
	return links
}

func cleanTags(tags []string) []string {
	result := make([]string, 0, len(tags))
	seen := make(map[string]bool)

	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}

		key := strings.ToLower(tag)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, tag)
	}

	return result
}

func monthLabel(month string) string {
	if len(month) == 7 && month[4] == '-' {
		return month[:4] + " 年 " + month[5:] + " 月"
	}
	return month
}

func archiveDateShort(date string) string {
	if len(date) >= 10 {
		return date[5:10]
	}
	return date
}

func transitionName(prefix, slug string) string {
	var builder strings.Builder
	builder.WriteString(prefix)
	builder.WriteByte('-')

	lastWasDash := false
	for _, r := range slug {
		if r >= 'A' && r <= 'Z' {
			r += 'a' - 'A'
		}

		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			builder.WriteRune(r)
			lastWasDash = false
			continue
		}

		if !lastWasDash {
			builder.WriteByte('-')
			lastWasDash = true
		}
	}

	name := strings.TrimRight(builder.String(), "-")
	if name == prefix {
		return prefix + "-note"
	}
	return name
}

func renderHeadings(headings []markdown.Heading) []render.Heading {
	result := make([]render.Heading, 0, len(headings))
	for _, heading := range headings {
		result = append(result, render.Heading{
			Level: heading.Level,
			Text:  heading.Text,
			ID:    heading.ID,
		})
	}
	return result
}

func buildObsidianIndex(notes []content.Note) (obsidian.Index, error) {
	targets := make([]obsidian.Target, 0, len(notes))
	for _, note := range notes {
		document, err := markdown.ToHTMLWithHeadings(note.Body)
		if err != nil {
			return obsidian.Index{}, fmt.Errorf("收集笔记标题 %s: %w", note.SourcePath, err)
		}

		headings := make(map[string]string)
		for _, heading := range document.Headings {
			headings[normalizeHeading(heading.Text)] = heading.ID
		}

		targets = append(targets, obsidian.Target{
			Title:      note.Title,
			Slug:       note.Slug,
			SourcePath: note.SourcePath,
			Headings:   headings,
		})
	}

	return obsidian.NewIndex(targets), nil
}

func normalizeHeading(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func copyNotesAssets(notesDir, publicDir string) error {
	sourceDir := filepath.Join(notesDir, "assets")
	targetDir := filepath.Join(publicDir, "notes", "assets")
	if err := copyDir(sourceDir, targetDir); err != nil {
		return fmt.Errorf("复制笔记图片资源: %w", err)
	}
	return nil
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
	return copyDirFiltered(sourceDir, targetDir, nil)
}

func copyDirFiltered(sourceDir, targetDir string, skip func(string, os.DirEntry) bool) error {
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
		if skip != nil && skip(relativePath, entry) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
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
