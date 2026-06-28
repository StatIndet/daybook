package site

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"unicode"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/feed"
	"github.com/StatIndet/daybook/internal/graph"
	"github.com/StatIndet/daybook/internal/i18n"
	"github.com/StatIndet/daybook/internal/markdown"
	"github.com/StatIndet/daybook/internal/obsidian"
	"github.com/StatIndet/daybook/internal/render"
	"github.com/StatIndet/daybook/internal/search"
	"github.com/StatIndet/daybook/internal/titlelayout"
)

type Options struct {
	Config       config.Config
	ContentDir   string
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
	groups, skipped, err := content.LoadNotes(options.NotesDir)
	if err != nil {
		return BuildResult{}, err
	}

	var allNotes []content.Note
	for _, group := range groups {
		for _, note := range group.Versions {
			allNotes = append(allNotes, *note)
		}
	}

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
	if err := copyAttachments(options.ContentDir, options.PublicDir, options.Config.Attachments); err != nil {
		return BuildResult{}, err
	}

	totalWordCount := 0
	for _, group := range groups {
		if note, _ := group.SelectVersion("zh-CN"); note != nil && !note.Draft {
			totalWordCount += note.WordCount
		} else if note, _ := group.SelectVersion("en"); note != nil && !note.Draft {
			totalWordCount += note.WordCount
		}
	}

	startedAt := options.Config.StartedAt
	if startedAt == "" && len(groups) > 0 {
		if note, _ := groups[len(groups)-1].SelectVersion("zh-CN"); note != nil {
			startedAt = note.Date
		} else if note, _ := groups[len(groups)-1].SelectVersion("en"); note != nil {
			startedAt = note.Date
		}
	}

	siteData := render.SiteData{
		Title:          options.Config.Title,
		StartedAt:      startedAt,
		TotalWordCount: totalWordCount,
	}

	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
	if err := search.BuildIndex(groups, estimateReadingTime, searchJSONPath); err != nil {
		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
	}

	obsidianIndex, err := buildObsidianIndex(allNotes, options.ContentDir, options.Config.Attachments)
	if err != nil {
		return BuildResult{}, err
	}

	tagRegistry, err := content.NewTagRegistry(allNotes)
	if err != nil {
		return BuildResult{}, fmt.Errorf("构建标签字典: %w", err)
	}

	renderer := render.New(options.TemplatesDir)

	langs := []string{"zh-CN", "en"}
	for _, lang := range langs {
		langPrefix := ""
		altLangPrefix := "en"
		if lang == "en" {
			langPrefix = "en"
			altLangPrefix = ""
		}

		langPublicDir := filepath.Join(options.PublicDir, langPrefix)
		if langPrefix != "" {
			if err := os.MkdirAll(langPublicDir, 0755); err != nil {
				return BuildResult{}, err
			}
		}

		var langNotes []content.Note
		var noteLinks []render.NoteLink
		var graphNodes []graph.InputNode
		var graphLinks []graph.InputLink

		tagLinks := collectTagLinksForLang(groups, lang, tagRegistry)

		for _, group := range groups {
			note, isFallback := group.SelectVersion(lang)
			if note == nil || note.Draft {
				continue
			}

			if group.IsListed(lang) {
				langNotes = append(langNotes, *note)
			}

			processed := obsidian.Process(note.Body, obsidianIndex)
			document, err := markdown.ToHTMLWithHeadings(processed.Text)
			if err != nil {
				return BuildResult{}, fmt.Errorf("处理笔记 %s: %w", note.SourcePath, err)
			}
			document.HTML = obsidian.RestoreHTML(document.HTML, processed.HTML)
			readingTime := estimateReadingTime(note.Body)

			slugToUse := note.Slug
			if lang == "en" {
				slugToUse = note.I18nKey // In English context, we could use I18nKey as slug for links to keep them stable, but actually note.Slug is what we have. Let's use note.Slug.
			}
			titleTransitionName := transitionName("note-title", slugToUse)
			dateTransitionName := transitionName("note-date", slugToUse)

			var tagNodes []graph.TagNode
			var displayTags []string
			var tagIDs []string
			seenTags := make(map[string]bool)

			for _, rawTag := range note.Tags {
				canonicalID := tagRegistry.GetID(rawTag)
				if seenTags[canonicalID] {
					continue
				}
				seenTags[canonicalID] = true

				displayTag := tagRegistry.GetTitle(canonicalID, lang)
				displayTags = append(displayTags, displayTag)
				tagIDs = append(tagIDs, canonicalID)

				tagNodes = append(tagNodes, graph.TagNode{
					ID:    "tag:" + canonicalID,
					Title: displayTag,
				})
			}

			tags := displayTags

			var attachmentNodes []graph.AttachmentNode
			seenAttachments := make(map[string]bool)
			for _, att := range processed.Attachments {
				if seenAttachments[att.Name] {
					continue
				}
				seenAttachments[att.Name] = true
				attachmentNodes = append(attachmentNodes, graph.AttachmentNode{
					ID:    "attachment:" + att.Name,
					Title: att.Name,
					URL:   att.PublicURL,
				})
			}

			// The user said: "同一个 i18n_key = 一个文章节点。当前语言有对应文章标题，则显示当前语言标题。"
			// Since we iterate through groups, there's exactly one node per group.
			graphNodes = append(graphNodes, graph.InputNode{
				ID:          group.I18nKey,
				Title:       note.Title,
				URL:         path.Join("/", langPrefix, "notes", note.Slug, "/"),
				Tags:        tagNodes,
				Attachments: attachmentNodes,
				Date:        note.Date,
			})

			for _, link := range processed.Links {
				targetID := link.Slug
				if !link.Exists {
					targetID = link.Target
				}
				// We need to resolve target slug to i18n_key if possible
				resolvedID := targetID
				for _, searchGroup := range groups {
					if targetNote, ok := searchGroup.Versions["zh-CN"]; ok && targetNote.Slug == targetID {
						resolvedID = searchGroup.I18nKey
						break
					}
					if targetNote, ok := searchGroup.Versions["en"]; ok && targetNote.Slug == targetID {
						resolvedID = searchGroup.I18nKey
						break
					}
				}

				graphLinks = append(graphLinks, graph.InputLink{
					Source: group.I18nKey,
					Target: resolvedID,
					Exists: link.Exists,
				})
			}

			titleLayoutHTML := titlelayout.GenerateHTML(note.Title, slugToUse)

			hasTranslation := len(group.Versions) > 1

			noteLink := render.NoteLink{
				Title:               note.Title,
				Date:                note.Date,
				Updated:             note.Updated,
				Lang:                lang,
				ReadingTime:         readingTime,
				ReadingMinutes:      note.ReadingMinutes,
				Summary:             note.Summary,
				Tags:                tags,
				TagIDs:              tagIDs,
				URL:                 path.Join("/", langPrefix, "notes", note.Slug, "/"),
				Slug:                note.Slug,
				Pin:                 note.Pin,
				HasTranslation:      hasTranslation,
				TitleLayout:         titleLayoutHTML,
				TitleTransitionName: titleTransitionName,
				DateTransitionName:  dateTransitionName,
			}

			if group.IsListed(lang) {
				noteLinks = append(noteLinks, noteLink)
			}

			commentEnabled := options.Config.Comment.Enabled
			if note.Comment != nil {
				commentEnabled = *note.Comment
			}
			tocEnabled := true
			if note.Toc != nil {
				tocEnabled = *note.Toc
			}

			altLang := "en"
			if lang == "en" {
				altLang = "zh-CN"
			}
			altNote, _ := group.SelectVersion(altLang)
			altURL := path.Join("/", altLangPrefix, "notes", altNote.Slug, "/")

			outputPath := filepath.Join(langPublicDir, "notes", note.Slug, "index.html")
			notePageData := render.NoteData{
				Site:         siteData,
				Config:       options.Config,
				PageTitle:    note.Title,
				PageKind:     "note",
				BodyClass:    "note-body page-body",
				Lang:         lang,
				AlternateURL: altURL,
				Assets:       assets,
				HasMath:      note.Math,
				Tags:         tagLinks,
				Note: render.NotePage{
					Title:               note.Title,
					Date:                note.Date,
					Updated:             note.Updated,
					ReadingTime:         readingTime,
					Summary:             note.Summary,
					URL:                 noteLink.URL,
					Slug:                group.I18nKey, // use I18nKey for Waline path
					Tags:                tags,
					WordCount:           note.WordCount,
					ReadingMinutes:      note.ReadingMinutes,
					CanonicalPath:       path.Join("/", langPrefix, "notes", note.Slug, "/"),
					HTML:                template.HTML(document.HTML),
					Headings:            renderHeadings(document.Headings),
					HasMermaid:          document.HasMermaid,
					HasMath:             note.Math,
					TocEnabled:          tocEnabled,
					CommentEnabled:      commentEnabled,
					IsFallback:          isFallback,
					HasTranslation:      hasTranslation,
					TitleLayout:         titleLayoutHTML,
					TitleTransitionName: titleTransitionName,
					DateTransitionName:  dateTransitionName,
				},
			}

			if err := renderer.RenderNote(outputPath, notePageData); err != nil {
				return BuildResult{}, fmt.Errorf("生成笔记页面 %s: %w", note.SourcePath, err)
			}

			// Generate lightweight fragment for temporary bilingual translation
			fragmentPath := filepath.Join(langPublicDir, "notes", note.Slug, "fragment.json")
			type fragmentData struct {
				Lang     string           `json:"lang"`
				Summary  string           `json:"summary"`
				HTML     string           `json:"html"`
				Headings []render.Heading `json:"headings"`
			}
			frag := fragmentData{
				Lang:     note.Lang,
				Summary:  note.Summary,
				HTML:     string(document.HTML),
				Headings: renderHeadings(document.Headings),
			}
			if b, err := json.Marshal(frag); err == nil {
				os.WriteFile(fragmentPath, b, 0644)
			}
		}

		indexPath := filepath.Join(langPublicDir, "index.html")
		indexData := render.IndexData{
			Site:         siteData,
			PageTitle:    i18n.T(lang, "nav.home"),
			PageKind:     "home",
			BodyClass:    "home-body",
			Lang:         lang,
			AlternateURL: path.Join("/", altLangPrefix, "/"),
			Assets:       assets,
			Notes:        noteLinks,
			Tags:         tagLinks,
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

		sortByUpdated := func(i, j int, list []render.NoteLink) bool {
			timeI := list[i].Updated
			if timeI == "" {
				timeI = list[i].Date
			}
			timeJ := list[j].Updated
			if timeJ == "" {
				timeJ = list[j].Date
			}
			if timeI == timeJ {
				return list[i].Title < list[j].Title
			}
			return timeI > timeJ
		}
		sort.SliceStable(pinnedNotes, func(i, j int) bool { return sortByUpdated(i, j, pinnedNotes) })
		sort.SliceStable(regularNotes, func(i, j int) bool { return sortByUpdated(i, j, regularNotes) })

		notesIndexPath := filepath.Join(langPublicDir, "notes", "index.html")
		notesData := render.NotesData{
			Site:         siteData,
			PageTitle:    i18n.T(lang, "nav.notes"),
			PageKind:     "notes",
			BodyClass:    "notes-list-body page-body",
			Lang:         lang,
			AlternateURL: path.Join("/", altLangPrefix, "notes", "/"),
			Assets:       assets,
			Notes:        noteLinks,
			PinnedNotes:  pinnedNotes,
			MonthGroups:  monthGroups(regularNotes),
			Tags:         tagLinks,
		}
		if err := renderer.RenderNotes(notesIndexPath, notesData); err != nil {
			return BuildResult{}, fmt.Errorf("生成文章页: %w", err)
		}

		archivePath := filepath.Join(langPublicDir, "archive", "index.html")
		archiveData := render.ArchiveData{
			Site:         siteData,
			PageTitle:    i18n.T(lang, "nav.archive"),
			PageKind:     "archive",
			BodyClass:    "archive-body page-body",
			Lang:         lang,
			AlternateURL: path.Join("/", altLangPrefix, "archive", "/"),
			Assets:       assets,
			Total:        len(noteLinks),
			YearGroups:   archiveYearGroups(noteLinks),
			Tags:         tagLinks,
		}
		if err := renderer.RenderArchive(archivePath, archiveData); err != nil {
			return BuildResult{}, fmt.Errorf("生成归档页: %w", err)
		}

		aboutFile := "about.md"
		if lang == "en" {
			enPath := filepath.Join(filepath.Dir(options.NotesDir), "pages", "about-en.md")
			if _, err := os.Stat(enPath); err == nil {
				aboutFile = "about-en.md"
			}
		}

		aboutPage, err := content.ParsePageFile(filepath.Join(filepath.Dir(options.NotesDir), "pages", aboutFile))
		if err != nil {
			return BuildResult{}, fmt.Errorf("读取关于页: %w", err)
		}
		aboutProcessed := obsidian.Process(aboutPage.Body, obsidianIndex)
		aboutDocument, err := markdown.ToHTMLWithHeadings(aboutProcessed.Text)
		if err != nil {
			return BuildResult{}, fmt.Errorf("处理关于页: %w", err)
		}
		aboutDocument.HTML = obsidian.RestoreHTML(aboutDocument.HTML, aboutProcessed.HTML)

		aboutEnPath := filepath.Join(filepath.Dir(options.NotesDir), "pages", "about-en.md")
		aboutZhPath := filepath.Join(filepath.Dir(options.NotesDir), "pages", "about.md")
		aboutHasTranslation := false
		if _, err1 := os.Stat(aboutEnPath); err1 == nil {
			if _, err2 := os.Stat(aboutZhPath); err2 == nil {
				aboutHasTranslation = true
			}
		}

		aboutPath := filepath.Join(langPublicDir, "about", "index.html")

		aboutFragmentPath := filepath.Join(langPublicDir, "about", "fragment.json")
		type aboutFragmentData struct {
			Lang     string           `json:"lang"`
			Summary  string           `json:"summary"`
			HTML     string           `json:"html"`
			Headings []render.Heading `json:"headings"`
		}
		aboutFrag := aboutFragmentData{
			Lang:     lang,
			Summary:  aboutPage.Summary,
			HTML:     string(aboutDocument.HTML),
			Headings: renderHeadings(aboutDocument.Headings),
		}
		if b, err := json.Marshal(aboutFrag); err == nil {
			os.MkdirAll(filepath.Dir(aboutFragmentPath), 0755)
			os.WriteFile(aboutFragmentPath, b, 0644)
		}

		aboutData := render.AboutData{
			Site:           siteData,
			PageTitle:      aboutPage.Title,
			PageKind:       "about",
			BodyClass:      "about-body page-body",
			Lang:           lang,
			AlternateURL:   path.Join("/", altLangPrefix, "about", "/"),
			Assets:         assets,
			Spiral:         render.NewGoldenSpiral(),
			HasTranslation: aboutHasTranslation,
			Title:          aboutPage.Title,
			Summary:        aboutPage.Summary,
			Date:           aboutPage.Date,
			Updated:        aboutPage.Updated,
			ReadingTime:    estimateReadingTime(aboutPage.Body),
			WordCount:      aboutPage.WordCount,
			HTML:           template.HTML(aboutDocument.HTML),
			Tags:           tagLinks,
		}
		if err := renderer.RenderAbout(aboutPath, aboutData); err != nil {
			return BuildResult{}, fmt.Errorf("生成关于页: %w", err)
		}

		graphJSONPath := filepath.Join(langPublicDir, "graph.json")
		if err := graph.BuildJSON(graphNodes, graphLinks, graphJSONPath); err != nil {
			return BuildResult{}, fmt.Errorf("生成 graph.json: %w", err)
		}

		graphPath := filepath.Join(langPublicDir, "graph", "index.html")
		graphData := render.GraphData{
			Site:         siteData,
			PageTitle:    i18n.T(lang, "nav.graph"),
			PageKind:     "graph",
			BodyClass:    "graph-body page-body",
			Lang:         lang,
			AlternateURL: path.Join("/", altLangPrefix, "graph", "/"),
			Assets:       assets,
			Tags:         tagLinks,
		}
		if err := renderer.RenderGraph(graphPath, graphData); err != nil {
			return BuildResult{}, fmt.Errorf("生成图谱页: %w", err)
		}

		if err := feed.Write(filepath.Join(langPublicDir, "rss.xml"), options.Config, noteLinks); err != nil {
			return BuildResult{}, err
		}
	}

	return BuildResult{Notes: allNotes, Skipped: skipped}, nil
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
			TagIDs:      note.TagIDs,
			URL:         note.URL,
		})
	}

	return groups
}

func monthGroups(notes []render.NoteLink) []render.MonthGroup {
	groups := make([]render.MonthGroup, 0)
	currentMonth := ""

	for _, note := range notes {
		month := note.Updated
		if month == "" {
			month = note.Date
		}
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

func collectTagLinksForLang(groups []*content.ArticleGroup, lang string, tagRegistry *content.TagRegistry) []render.TagLink {
	canonicalIDs := make([]string, 0)
	seen := make(map[string]bool)

	for _, group := range groups {
		note, _ := group.SelectVersion(lang)
		if note == nil || note.Draft {
			continue
		}

		for _, rawTag := range note.Tags {
			id := tagRegistry.GetID(rawTag)
			if !seen[id] {
				seen[id] = true
				canonicalIDs = append(canonicalIDs, id)
			}
		}
	}

	sort.SliceStable(canonicalIDs, func(i, j int) bool {
		leftTitle := strings.ToLower(tagRegistry.GetTitle(canonicalIDs[i], lang))
		rightTitle := strings.ToLower(tagRegistry.GetTitle(canonicalIDs[j], lang))
		if leftTitle == rightTitle {
			return canonicalIDs[i] < canonicalIDs[j]
		}
		return leftTitle < rightTitle
	})

	langPrefix := ""
	if lang == "en" {
		langPrefix = "/en"
	}

	links := make([]render.TagLink, 0, len(canonicalIDs))
	for index, id := range canonicalIDs {
		title := tagRegistry.GetTitle(id, lang)
		links = append(links, render.TagLink{
			Name:         title,
			URL:          path.Join("/", langPrefix, "notes") + "/?tag=" + url.QueryEscape(id),
			Index:        index,
			ReverseIndex: len(canonicalIDs) - index - 1,
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

func buildObsidianIndex(notes []content.Note, contentDir string, cfg config.AttachmentConfig) (obsidian.Index, error) {
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

		blocks := make(map[string]string)
		lines := strings.Split(note.Body, "\n")
		for _, line := range lines {
			if idx := strings.LastIndex(line, " ^"); idx != -1 {
				blockID := strings.TrimSpace(line[idx+2:])
				if isValidBlockID(blockID) {
					// Simply use the raw line as the snippet for now.
					// Strip the block ID part.
					snippet := strings.TrimSpace(line[:idx])
					if snippet != "" {
						blocks[blockID] = snippet
					}
				}
			}
		}

		targets = append(targets, obsidian.Target{
			Title:      note.Title,
			Slug:       note.Slug,
			Summary:    note.Summary,
			Content:    note.Body,
			SourcePath: note.SourcePath,
			Headings:   headings,
			Blocks:     blocks,
		})
	}

	var attachments []obsidian.Attachment
	attDir := filepath.Join(contentDir, "attachments")
	if _, err := os.Stat(attDir); err == nil {
		err = filepath.WalkDir(attDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}

			relPath, err := filepath.Rel(attDir, path)
			if err != nil {
				return nil
			}

			// Replace Windows backslashes with forward slashes for relative paths
			relPath = filepath.ToSlash(relPath)

			ext := strings.ToLower(filepath.Ext(d.Name()))
			mediaType := ""
			switch {
			case obsidian.IsImageExt(ext):
				mediaType = "image"
			case ext == ".pdf":
				mediaType = "pdf"
			case obsidian.IsAudioExt(ext):
				mediaType = "audio"
			case obsidian.IsVideoExt(ext):
				mediaType = "video"
			default:
				if d.Name() != ".gitkeep" {
					fmt.Printf("[obsidian] unsupported attachment type: %s\n", d.Name())
				}
				return nil
			}

			isRemote := false
			for _, rdir := range cfg.RemoteDirs {
				if strings.HasPrefix(relPath, rdir+"/") {
					isRemote = true
					break
				}
			}

			pubMode := "local"
			var pubURL string
			if isRemote {
				pubMode = "remote"
				pubURL = cfg.RemoteBaseURL + "/" + escapeURLPath(relPath)
			} else {
				pubMode = "local"
				pubURL = cfg.PublicPath + escapeURLPath(relPath)
				info, err := d.Info()
				if err == nil && info.Size() > 25*1024*1024 {
					fmt.Printf("[obsidian] local attachment may exceed Pages single-file limit: %s\n", d.Name())
				}
			}

			attachments = append(attachments, obsidian.Attachment{
				Name:        d.Name(),
				RelPath:     relPath,
				AbsPath:     path,
				Ext:         ext,
				MediaType:   mediaType,
				PublishMode: pubMode,
				PublicURL:   pubURL,
			})
			return nil
		})
		if err != nil {
			return obsidian.Index{}, fmt.Errorf("扫描附件目录: %w", err)
		}
	}

	return obsidian.NewIndex(targets, attachments, cfg.RemoteDirs, cfg.RemoteBaseURL), nil
}

func escapeURLPath(p string) string {
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func isValidBlockID(id string) bool {
	if id == "" {
		return false
	}
	for _, r := range id {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-') {
			return false
		}
	}
	return true
}

func normalizeHeading(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func copyAttachments(contentDir, publicDir string, cfg config.AttachmentConfig) error {
	sourceDir := filepath.Join(contentDir, "attachments")
	targetDir := filepath.Join(publicDir, "attachments")

	return copyDirFiltered(sourceDir, targetDir, func(relativePath string, entry os.DirEntry) bool {
		if entry.IsDir() {
			return false // Don't skip directories entirely yet, allow traversing
		}

		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !obsidian.IsImageExt(ext) && ext != ".pdf" && !obsidian.IsAudioExt(ext) && !obsidian.IsVideoExt(ext) {
			if entry.Name() != ".gitkeep" {
				fmt.Printf("[obsidian] unsupported attachment type: %s\n", entry.Name())
			}
			return true // Skip unsupported
		}

		relPath := filepath.ToSlash(relativePath)
		isRemote := false
		for _, rdir := range cfg.RemoteDirs {
			if strings.HasPrefix(relPath, rdir+"/") {
				isRemote = true
				break
			}
		}

		if isRemote {
			pubURL := cfg.RemoteBaseURL + "/" + escapeURLPath(relPath)
			fmt.Printf("[obsidian] remote attachment not copied: %s -> %s\n", relPath, pubURL)
			return true // Skip remote files
		}

		return false // Copy local files
	})
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
