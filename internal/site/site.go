package site

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/feed"
	"github.com/StatIndet/daybook/internal/github"
	"github.com/StatIndet/daybook/internal/graph"
	"github.com/StatIndet/daybook/internal/i18n"
	"github.com/StatIndet/daybook/internal/markdown"
	"github.com/StatIndet/daybook/internal/media"
	"github.com/StatIndet/daybook/internal/morphable"
	"github.com/StatIndet/daybook/internal/obsidian"
	"github.com/StatIndet/daybook/internal/og"
	"github.com/StatIndet/daybook/internal/progress"
	"github.com/StatIndet/daybook/internal/render"
	"github.com/StatIndet/daybook/internal/search"
	"github.com/StatIndet/daybook/internal/seo"
	"github.com/StatIndet/daybook/internal/sitemap"
)

type Options struct {
	Config     config.Config
	ContentDir string
	NotesDir   string
	MemosDir   string
	PublicDir  string
	Reporter   *progress.Reporter
}

type BuildResult struct {
	Notes   []content.Note
	Memos   []content.Note
	Skipped []string
}

func joinURL(parts ...string) string {
	p := path.Join(parts...)
	if !strings.HasSuffix(p, "/") {
		p += "/"
	}
	return p
}

func Build(options Options) (BuildResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	githubProfile, warnings, err := github.Sync(ctx, options.Config.GitHub, filepath.Join(filepath.Dir(options.PublicDir), ".daybook-cache", "github"))
	if err != nil {
		return BuildResult{}, fmt.Errorf("sync GitHub profile: %w", err)
	}
	for _, warning := range warnings {
		fmt.Printf("[github] warning: %s\n", warning)
	}
	if githubProfile != nil {
		applyGitHubProfile(&options.Config, githubProfile)
	}
	if options.Reporter != nil {
		options.Reporter.SetStage(0, 0) // No total known for scanning
	}
	groups, skipped, err := content.LoadNotes(options.NotesDir)
	if err != nil {
		return BuildResult{}, err
	}
	if options.MemosDir == "" {
		options.MemosDir = filepath.Join(filepath.Dir(options.NotesDir), "memos")
	}
	memoGroups, memoSkipped, err := content.LoadMemos(options.MemosDir)
	if err != nil {
		return BuildResult{}, err
	}
	noteGroups := groups
	groups = append(groups, memoGroups...)
	skipped = append(skipped, memoSkipped...)

	var allNotes []content.Note
	canonicalArticleRoutes := make(map[string]bool)
	for _, group := range groups {
		for _, note := range group.Versions {
			allNotes = append(allNotes, *note)
			if !note.Draft {
				canonicalArticleRoutes[note.URL] = true
			}
		}
	}

	if err := os.RemoveAll(options.PublicDir); err != nil {
		return BuildResult{}, fmt.Errorf("清理 public 目录: %w", err)
	}
	if err := os.MkdirAll(options.PublicDir, 0755); err != nil {
		return BuildResult{}, fmt.Errorf("创建 public 目录: %w", err)
	}

	if err := copyStaticDir("static", options.PublicDir); err != nil {
		return BuildResult{}, err
	}
	assets, err := buildAssets("static", options.PublicDir)
	if err != nil {
		return BuildResult{}, err
	}
	if githubProfile != nil {
		data, err := json.Marshal(githubProfile)
		if err != nil {
			return BuildResult{}, fmt.Errorf("encode GitHub profile: %w", err)
		}
		if err := os.WriteFile(filepath.Join(options.PublicDir, "github-profile.json"), data, 0644); err != nil {
			return BuildResult{}, fmt.Errorf("write GitHub profile: %w", err)
		}
	}
	if err := copyAttachments(options.ContentDir, options.PublicDir); err != nil {
		return BuildResult{}, err
	}

	if options.Config.Site.Favicon != "" {
		faviconPath := filepath.Join(options.ContentDir, filepath.FromSlash(options.Config.Site.Favicon))
		if _, err := os.Stat(faviconPath); err != nil {
			return BuildResult{}, fmt.Errorf("favicon file not found: %s", options.Config.Site.Favicon)
		}
	}

	totalWordCount := 0
	startedAt := options.Config.Site.StartedAt
	for _, group := range groups {
		for _, note := range group.PublishedVersions() {
			totalWordCount += note.WordCount
			if options.Config.Site.StartedAt == "" && (startedAt == "" || content.CompareDates(note.Date, startedAt) < 0) {
				startedAt = note.Date
			}
		}
	}

	musicUrls := make(map[string]bool)
	for _, group := range groups {
		for _, note := range group.Versions {
			urls := markdown.CollectMusicDirectives(note.Body)
			for _, u := range urls {
				musicUrls[u] = true
			}
		}
	}

	musicMetadataMap := make(map[string]media.MusicMetadata)
	if len(musicUrls) > 0 {
		musicUrlsList := make([]string, 0, len(musicUrls))
		for u := range musicUrls {
			musicUrlsList = append(musicUrlsList, u)
		}
		if options.Reporter != nil {
			options.Reporter.SetStage(1, len(musicUrlsList))
		}
		for i, u := range musicUrlsList {
			meta, err := media.FetchMusicMetadata(u, options.PublicDir)
			if options.Reporter != nil {
				options.Reporter.Advance(i + 1)
			}
			if err != nil {
				fmt.Printf("[music] warning: failed to fetch metadata for %s: %v\n", u, err)
				continue
			}
			musicMetadataMap[u] = meta
		}
	}

	markdown.SetMusicMetadataRegistry(musicMetadataMap)

	uptimeDays := 0
	if startedAt != "" {
		if t, err := content.ParseDate(startedAt); err == nil {
			uptimeDays = int(time.Since(t).Hours() / 24)
			if uptimeDays < 0 {
				uptimeDays = 0
			}
		}
	}

	siteData := render.SiteData{
		StartedAt:      startedAt,
		UptimeDays:     uptimeDays,
		TotalWordCount: totalWordCount,
	}

	if options.Reporter != nil {
		options.Reporter.SetStage(2, len(allNotes))
	}
	obsidianIndex, err := buildObsidianIndex(allNotes, options.ContentDir, options.PublicDir, "/", func(current, total int) {
		if options.Reporter != nil {
			options.Reporter.Advance(current)
		}
	})
	if err != nil {
		return BuildResult{}, err
	}

	tagRegistry, err := content.NewTagRegistry(allNotes)
	if err != nil {
		return BuildResult{}, fmt.Errorf("构建标签字典: %w", err)
	}

	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
	if options.Reporter != nil {
		options.Reporter.SetStage(3, len(groups))
	}
	if err := search.BuildIndex(groups, estimateReadingTime, tagRegistry, searchJSONPath, func(current, total int) {
		if options.Reporter != nil {
			options.Reporter.Advance(current)
		}
	}); err != nil {
		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
	}

	renderer := render.New("templates")

	var allSiteURLs []sitemap.URL
	var ogCards []og.Card

	var allDiagnostics []obsidian.Diagnostic

	langs := []string{"zh_CN", "en_US"}
	totalItems := len(allNotes) * len(langs)
	processedItems := 0

	if options.Reporter != nil {
		options.Reporter.SetStage(4, totalItems)
	}

	for _, lang := range langs {
		langPrefix := ""
		altLangPrefix := "en_US"
		if lang == "en_US" {
			langPrefix = "en_US"
			altLangPrefix = ""
		}

		langPublicDir := filepath.Join(options.PublicDir, langPrefix)
		if langPrefix != "" {
			if err := os.MkdirAll(langPublicDir, 0755); err != nil {
				return BuildResult{}, err
			}
		}

		var noteLinks []render.NoteLink
		var memoCards []render.MemoCard
		memosHaveMath := false
		var graphNodes []graph.InputNode
		var graphLinks []graph.InputLink
		var graphDocuments []graph.SearchDocument

		tagLinks := collectTagLinksForLang(groups, lang, tagRegistry)

		for _, group := range groups {
			for _, note := range group.PublishedVersions() {
				processedItems++
				if options.Reporter != nil {
					options.Reporter.Advance(processedItems)
				}

				processed := obsidian.Process(note.Body, obsidianIndex, note.SourcePath, note.BodyStartLine)
				allDiagnostics = append(allDiagnostics, processed.Diagnostics...)
				document, err := markdown.ToHTMLWithHeadings(processed.Text)
				if err != nil {
					return BuildResult{}, fmt.Errorf("处理笔记 %s: %w", note.SourcePath, err)
				}
				document.HTML = obsidian.RestoreHTML(document.HTML, processed.HTML)
				graphDocuments = append(graphDocuments, graph.NewSearchDocument(*note, document.HTML, options.Config.Graph.SearchProperties))
				readingTime := ""
				if note.Section != "memos" {
					readingTime = estimateReadingTime(note.Body)
				}

				transitionIdentity := group.I18nKey
				if transitionIdentity == "" {
					transitionIdentity = note.Slug
				}
				titleTransitionName := transitionName("note-title", transitionIdentity)
				dateTransitionName := transitionName("note-date", transitionIdentity)

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

					displayTag := tagRegistry.GetTitle(canonicalID)
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
					if seenAttachments[att.RelPath] {
						continue
					}
					seenAttachments[att.RelPath] = true
					attachmentNodes = append(attachmentNodes, graph.AttachmentNode{
						ID:    "attachment:" + att.RelPath,
						Title: att.Name,
						URL:   att.PublicURL,
						Path:  att.RelPath,
						File:  filepath.Base(att.RelPath),
					})
				}

				graphNodes = append(graphNodes, graph.InputNode{
					ID:          note.URL,
					Title:       note.Title,
					URL:         note.URL,
					Path:        note.Section + "/" + note.Slug + filepath.Ext(note.SourcePath),
					File:        filepath.Base(note.SourcePath),
					Tags:        tagNodes,
					Attachments: attachmentNodes,
					Date:        note.Date,
				})

				for _, link := range processed.Links {
					targetID := link.URL
					if !link.Exists {
						targetID = link.Target
					}

					graphLinks = append(graphLinks, graph.InputLink{
						Source: note.URL,
						Target: targetID,
						Exists: link.Exists,
					})
				}

				titleLayoutHTML := morphable.GenerateHTML(note.Title, note.URL, "title")

				hasTranslation := len(group.PublishedVersions()) > 1

				noteLink := render.NoteLink{
					Section:             note.Section,
					Title:               note.Title,
					Date:                note.Date,
					Updated:             note.Updated,
					Lang:                lang,
					ReadingTime:         readingTime,
					ReadingMinutes:      note.ReadingMinutes,
					Summary:             note.Summary,
					Tags:                tags,
					TagIDs:              tagIDs,
					URL:                 note.URL,
					Slug:                note.Slug,
					Pinned:              note.Pinned,
					HasMusic:            note.HasMusic,
					HasTranslation:      hasTranslation,
					TitleLayout:         titleLayoutHTML,
					TitleTransitionName: titleTransitionName,
					DateTransitionName:  dateTransitionName,
				}

				noteLinks = append(noteLinks, noteLink)
				hasMath := note.Math || strings.Contains(document.HTML, `class="math-`)
				dateDisplay := note.Date
				updatedDisplay := note.Updated
				if note.Section == "memos" {
					memoLink := noteLink
					memoLink.Lang = note.Lang
					card, err := buildMemoCard(memoLink, note.Location, document.HTML)
					if err != nil {
						return BuildResult{}, fmt.Errorf("处理短记卡片 %s: %w", note.SourcePath, err)
					}
					card.CommentEnabled = options.Config.Comment.Available() && (note.Comment == nil || *note.Comment)
					card.ShareURL = strings.TrimSuffix(options.Config.Site.URL, "/") + note.URL
					card.ShareText = strings.ReplaceAll(options.Config.Share.Text, "{Title}", note.Title)
					memoCards = append(memoCards, card)
					dateDisplay = card.DateDisplay
					updatedDisplay = card.UpdatedDisplay
					memosHaveMath = memosHaveMath || hasMath
				}

				// Article routes follow their source language. The surrounding UI can
				// switch independently in the browser without replacing the article.
				if note.Lang != lang {
					legacyPath := joinURL("/", langPrefix, note.Section, note.Slug)
					if !canonicalArticleRoutes[legacyPath] {
						target := note.URL + "?ui=" + lang
						alias := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body><a href="%s">Continue</a></body></html>`, template.HTMLEscapeString(strings.TrimSuffix(options.Config.Site.URL, "/")+note.URL), template.HTMLEscapeString(target), template.HTMLEscapeString(target))
						aliasPath := filepath.Join(langPublicDir, note.Section, note.Slug, "index.html")
						if err := os.MkdirAll(filepath.Dir(aliasPath), 0755); err != nil {
							return BuildResult{}, err
						}
						if err := os.WriteFile(aliasPath, []byte(alias), 0644); err != nil {
							return BuildResult{}, fmt.Errorf("生成文章语言界面重定向: %w", err)
						}
					}
					continue
				}

				commentEnabled := options.Config.Comment.Available()
				if note.Comment != nil {
					commentEnabled = commentEnabled && *note.Comment
				}
				tocEnabled := note.Section != "memos"
				if note.Toc != nil {
					tocEnabled = *note.Toc
				}

				altLang := "en_US"
				if lang == "en_US" {
					altLang = "zh_CN"
				}
				translationURL := ""
				if altNote := group.Versions[altLang]; altNote != nil && !altNote.Draft {
					translationURL = altNote.URL
				}
				altURL := note.URL + "?ui=" + altLang

				outputPath := filepath.Join(langPublicDir, note.Section, note.Slug, "index.html")
				var noteAlternates []seo.Alternate
				if hasTranslation {
					for altL, altNote := range group.Versions {
						if altNote.Draft {
							continue
						}
						altPrefix := ""
						if altL == "en_US" {
							altPrefix = "/en_US"
						}
						noteAlternates = append(noteAlternates, seo.Alternate{
							Lang: altL,
							URL:  joinURL("/", altPrefix, altNote.Section, altNote.Slug),
						})
					}
				} else {
					noteAlternates = []seo.Alternate{{Lang: lang, URL: joinURL("/", langPrefix, note.Section, note.Slug)}}
				}

				ogCard, err := og.NewCard(*note, document.HTML, options.Config, displayTags)
				if err != nil {
					return BuildResult{}, fmt.Errorf("准备分享图片 %s: %w", note.SourcePath, err)
				}
				ogCards = append(ogCards, ogCard)
				noteSEOArgs := seo.BuilderArgs{
					Config:      options.Config,
					Lang:        lang,
					Title:       note.Title,
					Description: ogCard.Description,
					Image:       ogCard.OutputPath,
					ImageWidth:  1200,
					ImageHeight: 630,
					ImageType:   "image/png",
					PageURL:     joinURL("/", langPrefix, note.Section, note.Slug),
					Published:   note.Date,
					Modified:    note.Updated,
					Tags:        displayTags,
					Alternates:  noteAlternates,
				}

				canonicalPath := joinURL("/", langPrefix, note.Section, note.Slug)
				shareURL := strings.TrimSuffix(options.Config.Site.URL, "/") + canonicalPath
				shareText := strings.ReplaceAll(options.Config.Share.Text, "{Title}", note.Title)

				pageKind, bodyClass := "note", "note-body page-body"
				var pageSEO seo.SEOData
				if note.Section == "memos" {
					pageKind, bodyClass = "memo", "note-body memo-body page-body"
					pageSEO = seo.BuildForMemo(noteSEOArgs)
				} else {
					pageSEO = seo.BuildForNote(noteSEOArgs)
				}
				notePageData := render.NoteData{
					Site:         siteData,
					Config:       options.Config,
					PageTitle:    note.Title,
					PageKind:     pageKind,
					BodyClass:    bodyClass,
					Lang:         lang,
					AlternateURL: altURL,
					Assets:       assets,
					HasMath:      hasMath,
					Tags:         tagLinks,
					SEO:          pageSEO,
					Note: render.NotePage{
						Section:             note.Section,
						Location:            note.Location,
						Title:               note.Title,
						Date:                note.Date,
						DateDisplay:         dateDisplay,
						Updated:             note.Updated,
						UpdatedDisplay:      updatedDisplay,
						ReadingTime:         readingTime,
						Summary:             note.Summary,
						URL:                 noteLink.URL,
						Slug:                note.Slug,
						I18nKey:             group.I18nKey,
						CommentPath:         canonicalPath,
						Tags:                tags,
						WordCount:           note.WordCount,
						ReadingMinutes:      note.ReadingMinutes,
						CanonicalPath:       canonicalPath,
						ShareURL:            shareURL,
						ShareText:           shareText,
						HTML:                template.HTML(document.HTML),
						Headings:            renderHeadings(document.Headings),
						HasMermaid:          document.HasMermaid,
						HasMath:             hasMath,
						TocEnabled:          tocEnabled,
						CommentEnabled:      commentEnabled,
						Lang:                note.Lang,
						TranslationURL:      translationURL,
						HasTranslation:      hasTranslation,
						Pinned:              note.Pinned,
						HasMusic:            note.HasMusic,
						TitleLayout:         titleLayoutHTML,
						TitleTransitionName: titleTransitionName,
						DateTransitionName:  dateTransitionName,
					},
				}

				if err := renderer.RenderNote(outputPath, notePageData); err != nil {
					return BuildResult{}, fmt.Errorf("生成笔记页面 %s: %w", note.SourcePath, err)
				}

			}
		}

		// Sorting versions by their own date prevents repeated archive year groups.
		sort.SliceStable(noteLinks, func(i, j int) bool {
			if cmp := content.CompareDates(noteLinks[i].Date, noteLinks[j].Date); cmp != 0 {
				return cmp > 0
			}
			if noteLinks[i].Title != noteLinks[j].Title {
				return noteLinks[i].Title < noteLinks[j].Title
			}
			return noteLinks[i].URL < noteLinks[j].URL
		})

		indexPath := filepath.Join(langPublicDir, "index.html")
		homeAlternates := []seo.Alternate{{Lang: "zh_CN", URL: "/"}, {Lang: "en_US", URL: "/en_US/"}}
		homeSEOArgs := seo.BuilderArgs{
			GitHub:      githubProfile,
			Config:      options.Config,
			Lang:        lang,
			Title:       options.Config.GetHomeTitle(lang),
			Description: options.Config.GetHomeDescription(lang),
			PageURL:     joinURL("/", langPrefix),
			Alternates:  homeAlternates,
		}

		indexData := render.IndexData{
			GitHub:       githubProfile,
			Site:         siteData,
			Config:       options.Config,
			PageTitle:    i18n.T(lang, "nav.home"),
			PageKind:     "home",
			BodyClass:    "home-body",
			Lang:         lang,
			AlternateURL: joinURL("/", altLangPrefix),
			Assets:       assets,
			Notes:        noteLinks,
			Tags:         tagLinks,
			SEO:          seo.BuildForHome(homeSEOArgs),
		}
		if err := renderer.RenderIndex(indexPath, indexData); err != nil {
			return BuildResult{}, fmt.Errorf("生成首页: %w", err)
		}

		var pinnedNotes []render.NoteLink
		var regularNotes []render.NoteLink
		for _, link := range noteLinks {
			if link.Section == "memos" {
				continue
			}
			if link.Pinned {
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
			return content.CompareDates(timeI, timeJ) > 0
		}
		sort.SliceStable(pinnedNotes, func(i, j int) bool { return sortByUpdated(i, j, pinnedNotes) })
		sort.SliceStable(regularNotes, func(i, j int) bool { return sortByUpdated(i, j, regularNotes) })

		baseNotesPath := joinURL("/", langPrefix, "notes")

		totalPages := int(math.Ceil(float64(len(regularNotes)) / float64(PageSize)))
		if totalPages == 0 {
			totalPages = 1
		}

		for p := 1; p <= totalPages; p++ {
			var pagePath string
			var pageURL string
			if p == 1 {
				pagePath = filepath.Join(langPublicDir, "notes", "index.html")
				pageURL = baseNotesPath
			} else {
				pagePath = filepath.Join(langPublicDir, "notes", "page", fmt.Sprintf("%d", p), "index.html")
				pageURL = joinURL(baseNotesPath, "page", fmt.Sprintf("%d", p))
			}

			if err := os.MkdirAll(filepath.Dir(pagePath), 0755); err != nil {
				return BuildResult{}, err
			}

			startIdx := (p - 1) * PageSize
			endIdx := startIdx + PageSize
			if endIdx > len(regularNotes) {
				endIdx = len(regularNotes)
			}

			pageNotes := regularNotes
			if startIdx < len(regularNotes) {
				pageNotes = regularNotes[startIdx:endIdx]
			} else {
				pageNotes = nil
			}

			pagePinned := pinnedNotes
			if p > 1 {
				pagePinned = nil
			}

			notesAlternates := []seo.Alternate{{Lang: "zh_CN", URL: "/notes/"}, {Lang: "en_US", URL: "/en_US/notes/"}}
			if p > 1 {
				pageStr := fmt.Sprintf("page/%d/", p)
				notesAlternates = []seo.Alternate{{Lang: "zh_CN", URL: "/notes/" + pageStr}, {Lang: "en_US", URL: "/en_US/notes/" + pageStr}}
			}

			notesSEOArgs := seo.BuilderArgs{
				Config:      options.Config,
				Lang:        lang,
				Title:       i18n.T(lang, "nav.notes"),
				Description: i18n.T(lang, "seo.notes.description"),
				PageURL:     pageURL,
				Alternates:  notesAlternates,
			}
			seoData := seo.BuildForCollection(notesSEOArgs)

			paginationData := generatePaginationData(len(regularNotes), p, joinURL(langPrefix, "notes"))
			seoData.PaginationPrev = paginationData.PrevURL
			seoData.PaginationNext = paginationData.NextURL

			altURL := joinURL("/", altLangPrefix, "notes")
			if p > 1 {
				altURL = joinURL("/", altLangPrefix, "notes", "page", fmt.Sprintf("%d", p))
			}

			notesData := render.NotesData{
				Site:         siteData,
				Config:       options.Config,
				PageTitle:    i18n.T(lang, "nav.notes"),
				PageKind:     "notes",
				BodyClass:    "notes-list-body page-body",
				Lang:         lang,
				AlternateURL: altURL,
				Assets:       assets,
				Notes:        pageNotes,
				PinnedNotes:  pagePinned,
				MonthGroups:  monthGroups(pageNotes),
				Tags:         tagLinks,
				SEO:          seoData,
				Pagination:   paginationData,
			}

			if err := renderer.RenderNotes(pagePath, notesData); err != nil {
				return BuildResult{}, fmt.Errorf("生成文章页: %w", err)
			}
			allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: pageURL})
		}

		// Create alias redirect for page 1
		page1AliasPath := filepath.Join(langPublicDir, "notes", "page", "1", "index.html")
		if err := os.MkdirAll(filepath.Dir(page1AliasPath), 0755); err == nil {
			aliasHTML := fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>`, baseNotesPath, baseNotesPath)
			os.WriteFile(page1AliasPath, []byte(aliasHTML), 0644)
		}

		sort.SliceStable(memoCards, func(i, j int) bool {
			if memoCards[i].Pinned != memoCards[j].Pinned {
				return memoCards[i].Pinned
			}
			if cmp := content.CompareDates(memoCards[i].Date, memoCards[j].Date); cmp != 0 {
				return cmp > 0
			}
			return memoCards[i].URL < memoCards[j].URL
		})
		memosURL := joinURL("/", langPrefix, "memos")
		memosData := render.MemosData{
			Site: siteData, Config: options.Config, PageTitle: i18n.T(lang, "nav.memos"),
			PageKind: "memos", BodyClass: "memos-body page-body", Lang: lang,
			AlternateURL: joinURL("/", altLangPrefix, "memos"), Assets: assets,
			HasMath: memosHaveMath, Memos: memoCards,
			Tags: collectTagLinksForLang(memoGroups, lang, tagRegistry),
			SEO: seo.BuildForCollection(seo.BuilderArgs{
				Config: options.Config, Lang: lang, Title: i18n.T(lang, "nav.memos"),
				Description: i18n.T(lang, "seo.memos.description"), PageURL: memosURL,
				Alternates: []seo.Alternate{{Lang: "zh_CN", URL: "/memos/"}, {Lang: "en_US", URL: "/en_US/memos/"}},
			}),
		}
		if err := renderer.RenderMemos(filepath.Join(langPublicDir, "memos", "index.html"), memosData); err != nil {
			return BuildResult{}, fmt.Errorf("生成短记页面: %w", err)
		}
		allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: memosURL})

		archivePath := filepath.Join(langPublicDir, "archive", "index.html")
		archiveAlternates := []seo.Alternate{{Lang: "zh_CN", URL: "/archive/"}, {Lang: "en_US", URL: "/en_US/archive/"}}
		archiveSEOArgs := seo.BuilderArgs{
			Config:      options.Config,
			Lang:        lang,
			Title:       i18n.T(lang, "nav.archive"),
			Description: i18n.T(lang, "seo.archive.description"),
			PageURL:     joinURL("/", langPrefix, "archive"),
			Alternates:  archiveAlternates,
		}

		var archiveNotes []render.NoteLink
		for _, link := range noteLinks {
			if link.Section != "memos" {
				archiveNotes = append(archiveNotes, link)
			}
		}
		allArchiveRows := buildArchiveRows(archiveNotes)
		var bootstrapRows []render.ArchiveRow
		if len(allArchiveRows) > 8 {
			bootstrapRows = allArchiveRows[:8]
		} else {
			bootstrapRows = allArchiveRows
		}

		archiveData := render.ArchiveData{
			Site:         siteData,
			Config:       options.Config,
			PageTitle:    i18n.T(lang, "nav.archive"),
			PageKind:     "archive",
			BodyClass:    "archive-body page-body",
			Lang:         lang,
			AlternateURL: joinURL("/", altLangPrefix, "archive"),
			Assets:       assets,
			Total:        len(archiveNotes),
			Rows:         bootstrapRows,
			Tags:         collectTagLinksForLang(noteGroups, lang, tagRegistry),
			SEO:          seo.BuildForCollection(archiveSEOArgs),
		}
		if err := renderer.RenderArchive(archivePath, archiveData); err != nil {
			return BuildResult{}, fmt.Errorf("生成归档页: %w", err)
		}

		// Write all data to data.json
		archiveDataJSON := struct {
			Version int                 `json:"version"`
			Total   int                 `json:"total"`
			Rows    []render.ArchiveRow `json:"rows"`
		}{
			Version: 1,
			Total:   len(archiveNotes),
			Rows:    allArchiveRows,
		}

		dataJSONPath := filepath.Join(langPublicDir, "archive", "data.json")
		dataJSONBytes, err := json.Marshal(archiveDataJSON)
		if err != nil {
			return BuildResult{}, err
		}
		if err := os.WriteFile(dataJSONPath, dataJSONBytes, 0644); err != nil {
			return BuildResult{}, err
		}

		aboutFile := "about.md"
		if lang == "en_US" {
			enPath := filepath.Join(filepath.Dir(options.NotesDir), "pages", "about-en.md")
			if _, err := os.Stat(enPath); err == nil {
				aboutFile = "about-en.md"
			}
		}

		aboutPage, err := content.ParsePageFile(filepath.Join(filepath.Dir(options.NotesDir), "pages", aboutFile))
		if err != nil {
			return BuildResult{}, fmt.Errorf("读取关于页: %w", err)
		}
		aboutProcessed := obsidian.Process(aboutPage.Body, obsidianIndex, aboutPage.SourcePath, aboutPage.BodyStartLine)
		allDiagnostics = append(allDiagnostics, aboutProcessed.Diagnostics...)
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

		var aboutAlternates []seo.Alternate
		if aboutHasTranslation {
			aboutAlternates = []seo.Alternate{{Lang: "zh_CN", URL: "/about/"}, {Lang: "en_US", URL: "/en_US/about/"}}
		} else {
			aboutAlternates = []seo.Alternate{{Lang: lang, URL: joinURL("/", langPrefix, "about")}}
		}
		aboutSEOArgs := seo.BuilderArgs{
			Config:      options.Config,
			Lang:        lang,
			Title:       aboutPage.Title,
			Description: aboutPage.Summary,
			PageURL:     joinURL("/", langPrefix, "about"),
			Published:   aboutPage.Date,
			Modified:    aboutPage.Updated,
			Alternates:  aboutAlternates,
		}

		aboutData := render.AboutData{
			Site:           siteData,
			Config:         options.Config,
			PageTitle:      aboutPage.Title,
			PageKind:       "about",
			BodyClass:      "about-body page-body",
			Lang:           lang,
			AlternateURL:   joinURL("/", altLangPrefix, "about"),
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
			SEO:            seo.BuildForAbout(aboutSEOArgs),
		}
		if err := renderer.RenderAbout(aboutPath, aboutData); err != nil {
			return BuildResult{}, fmt.Errorf("生成关于页: %w", err)
		}

		graphJSONPath := filepath.Join(langPublicDir, "graph.json")
		if err := graph.BuildJSON(graphNodes, graphLinks, graphJSONPath); err != nil {
			return BuildResult{}, fmt.Errorf("生成 graph.json: %w", err)
		}
		if err := graph.BuildSearchJSON(graphDocuments, filepath.Join(langPublicDir, "graph-search.json")); err != nil {
			return BuildResult{}, fmt.Errorf("生成 graph-search.json: %w", err)
		}

		graphPath := filepath.Join(langPublicDir, "graph", "index.html")
		graphAlternates := []seo.Alternate{{Lang: "zh_CN", URL: "/graph/"}, {Lang: "en_US", URL: "/en_US/graph/"}}
		graphSEOArgs := seo.BuilderArgs{
			Config:      options.Config,
			Lang:        lang,
			Title:       i18n.T(lang, "nav.graph"),
			Description: i18n.T(lang, "seo.graph.description"),
			PageURL:     joinURL("/", langPrefix, "graph"),
			Alternates:  graphAlternates,
		}

		graphData := render.GraphData{
			Site:         siteData,
			Config:       options.Config,
			PageTitle:    i18n.T(lang, "nav.graph"),
			PageKind:     "graph",
			BodyClass:    "graph-body page-body",
			Lang:         lang,
			AlternateURL: joinURL("/", altLangPrefix, "graph"),
			Assets:       assets,
			Tags:         tagLinks,
			SEO:          seo.BuildForGraph(graphSEOArgs),
		}
		if err := renderer.RenderGraph(graphPath, graphData); err != nil {
			return BuildResult{}, fmt.Errorf("生成图谱页: %w", err)
		}

		if err := feed.Write(filepath.Join(langPublicDir, "rss.xml"), lang, options.Config, noteLinks); err != nil {
			return BuildResult{}, err
		}

		for _, tagLink := range tagLinks {
			var tagNotes []render.NoteLink

			for _, n := range noteLinks {
				for _, displayTag := range n.Tags {
					if displayTag == tagLink.Name {
						tagNotes = append(tagNotes, n)
						break
					}
				}
			}

			baseTagPath := joinURL("/", langPrefix, "tags", seo.TagSlug(tagLink.Name))
			totalPages := int(math.Ceil(float64(len(tagNotes)) / float64(PageSize)))
			if totalPages == 0 {
				totalPages = 1
			}

			for p := 1; p <= totalPages; p++ {
				var pagePath string
				var pageURL string
				if p == 1 {
					pagePath = filepath.Join(langPublicDir, "tags", seo.TagSlug(tagLink.Name), "index.html")
					pageURL = baseTagPath
				} else {
					pagePath = filepath.Join(langPublicDir, "tags", seo.TagSlug(tagLink.Name), "page", fmt.Sprintf("%d", p), "index.html")
					pageURL = joinURL(baseTagPath, "page", fmt.Sprintf("%d", p))
				}

				if err := os.MkdirAll(filepath.Dir(pagePath), 0755); err != nil {
					return BuildResult{}, err
				}

				startIdx := (p - 1) * PageSize
				endIdx := startIdx + PageSize
				if endIdx > len(tagNotes) {
					endIdx = len(tagNotes)
				}

				pageNotes := tagNotes
				if startIdx < len(tagNotes) {
					pageNotes = tagNotes[startIdx:endIdx]
				} else {
					pageNotes = nil
				}

				tagAlternates := []seo.Alternate{{Lang: lang, URL: baseTagPath}}
				if p > 1 {
					tagAlternates = []seo.Alternate{{Lang: lang, URL: joinURL(baseTagPath, "page", fmt.Sprintf("%d", p))}}
				}

				altURL := joinURL("/", altLangPrefix, "tags", seo.TagSlug(tagLink.Name))
				if p > 1 {
					altURL = joinURL(altURL, "page", fmt.Sprintf("%d", p))
				}
				altLang := "en_US"
				if lang == "en_US" {
					altLang = "zh_CN"
				}
				tagAlternates = append(tagAlternates, seo.Alternate{Lang: altLang, URL: altURL})

				tagSEOArgs := seo.BuilderArgs{
					Config:      options.Config,
					Lang:        lang,
					Title:       "#" + tagLink.Name,
					Description: fmt.Sprintf(i18n.T(lang, "seo.tag.description"), tagLink.Name),
					PageURL:     pageURL,
					Alternates:  tagAlternates,
				}

				seoData := seo.BuildForTag(tagSEOArgs)
				paginationData := generatePaginationData(len(tagNotes), p, joinURL(langPrefix, "tags", seo.TagSlug(tagLink.Name)))
				seoData.PaginationPrev = paginationData.PrevURL
				seoData.PaginationNext = paginationData.NextURL

				tagData := render.TagData{
					Site:         siteData,
					Config:       options.Config,
					PageTitle:    "#" + tagLink.Name,
					PageKind:     "tag",
					BodyClass:    "tag-body page-body",
					Lang:         lang,
					AlternateURL: altURL,
					Assets:       assets,
					Notes:        pageNotes,
					Tags:         tagLinks,
					SEO:          seoData,
					Pagination:   paginationData,
				}

				if err := renderer.RenderTag(pagePath, tagData); err != nil {
					return BuildResult{}, fmt.Errorf("生成标签页: %w", err)
				}

				// Add to sitemap
				allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: pageURL})
			}

			// Create alias redirect for page 1
			page1AliasPath := filepath.Join(langPublicDir, "tags", seo.TagSlug(tagLink.Name), "page", "1", "index.html")
			if err := os.MkdirAll(filepath.Dir(page1AliasPath), 0755); err == nil {
				aliasHTML := fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>`, baseTagPath, baseTagPath)
				os.WriteFile(page1AliasPath, []byte(aliasHTML), 0644)
			}
		}

		allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix)})

		allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix, "archive")})
		aboutLastMod := aboutPage.Updated
		if aboutLastMod == "" {
			aboutLastMod = aboutPage.Date
		}
		allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix, "about"), LastMod: aboutLastMod})

		for _, link := range noteLinks {
			if strings.HasPrefix(link.URL, "/en_US/") != (lang == "en_US") {
				continue
			}
			lastMod := link.Updated
			if lastMod == "" {
				lastMod = link.Date
			}
			allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: link.URL, LastMod: lastMod})
		}
	}

	var routePaths []string
	for _, u := range allSiteURLs {
		routePaths = append(routePaths, u.Loc)
	}
	routeBytes, _ := json.Marshal(routePaths)
	os.WriteFile(filepath.Join(options.PublicDir, "routes.json"), routeBytes, 0644)

	if err := sitemap.WriteSitemap(filepath.Join(options.PublicDir, "sitemap.xml"), options.Config, allSiteURLs); err != nil {
		return BuildResult{}, err
	}
	if err := sitemap.WriteRobots(filepath.Join(options.PublicDir, "robots.txt"), options.Config); err != nil {
		return BuildResult{}, err
	}

	if options.Reporter != nil {
		options.Reporter.SetStage(5, len(ogCards))
	}
	if err := og.Generate(options.PublicDir, ogCards); err != nil {
		return BuildResult{}, fmt.Errorf("生成静态分享图片: %w", err)
	}
	if options.Reporter != nil {
		options.Reporter.Advance(len(ogCards))
	}

	deduped := deduplicateDiagnostics(allDiagnostics)
	printDiagnostics(deduped)

	result := BuildResult{Skipped: skipped}
	for _, note := range allNotes {
		if note.Section == "memos" {
			result.Memos = append(result.Memos, note)
		} else {
			result.Notes = append(result.Notes, note)
		}
	}
	return result, nil
}

func deduplicateDiagnostics(diags []obsidian.Diagnostic) []obsidian.Diagnostic {
	seen := make(map[string]bool)
	var result []obsidian.Diagnostic
	for _, d := range diags {
		key := fmt.Sprintf("%s|%s|%d|%d|%s", d.Code, d.SourcePath, d.Line, d.Column, d.Message)
		if !seen[key] {
			seen[key] = true
			result = append(result, d)
		}
	}
	return result
}

func printDiagnostics(diags []obsidian.Diagnostic) {
	if len(diags) == 0 {
		fmt.Println("[daybook] build completed with no content warnings")
		return
	}

	summary := make(map[string]int)
	for _, d := range diags {
		summary[d.Code]++

		fmt.Printf("\n%s[%s]: %s\n", d.Severity, d.Code, d.Message)
		fmt.Printf("  --> %s:%d:%d\n", d.SourcePath, d.Line, d.Column)
		if d.Snippet != "" {
			fmt.Printf("   |\n")
			fmt.Printf("%-2d | %s\n", d.Line, d.Snippet)

			// simple underline
			indent := "   | "
			for i := 0; i < d.Column-1; i++ {
				indent += " "
			}
			fmt.Printf("%s^~~~~~\n", indent)
		}

		if len(d.Candidates) > 0 {
			fmt.Printf("\n  candidates:\n")
			for _, c := range d.Candidates {
				fmt.Printf("    %s\n", c)
			}
		}
	}

	fmt.Printf("\n[daybook] build completed with %d warnings:\n", len(diags))
	for code, count := range summary {
		name := strings.TrimPrefix(code, "obsidian/")
		name = strings.ReplaceAll(name, "-", " ")
		if count > 1 {
			name += "s"
		}
		fmt.Printf("  %d %s\n", count, name)
	}
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

func buildArchiveRows(notes []render.NoteLink) []render.ArchiveRow {
	var rows []render.ArchiveRow
	currentYear := ""
	lastNoteIdx := -1
	isFirstYear := true

	for index, note := range notes {
		year := note.Date
		if len(year) > 4 {
			year = year[:4]
		}

		if year != currentYear {
			if lastNoteIdx != -1 {
				rows[lastNoteIdx].IsLastInYear = true
			}
			rows = append(rows, render.ArchiveRow{
				Type:        "year",
				ID:          "year:" + year,
				Year:        year,
				IsFirstYear: isFirstYear,
			})
			isFirstYear = false
			currentYear = year
		}

		rows = append(rows, render.ArchiveRow{
			Type:        "note",
			ID:          "note:" + note.URL,
			Year:        year,
			Index:       index,
			Title:       note.Title,
			Date:        note.Date,
			DateShort:   archiveDateShort(note.Date),
			ReadingTime: note.ReadingTime,
			Summary:     note.Summary,
			TagIDs:      note.TagIDs,
			URL:         note.URL,
		})
		lastNoteIdx = len(rows) - 1
	}

	if lastNoteIdx != -1 {
		rows[lastNoteIdx].IsLastInYear = true
	}

	return rows
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
		for _, note := range group.PublishedVersions() {
			for _, rawTag := range note.Tags {
				id := tagRegistry.GetID(rawTag)
				if !seen[id] {
					seen[id] = true
					canonicalIDs = append(canonicalIDs, id)
				}
			}
		}
	}

	sort.SliceStable(canonicalIDs, func(i, j int) bool {
		leftTitle := strings.ToLower(tagRegistry.GetTitle(canonicalIDs[i]))
		rightTitle := strings.ToLower(tagRegistry.GetTitle(canonicalIDs[j]))
		if leftTitle == rightTitle {
			return canonicalIDs[i] < canonicalIDs[j]
		}
		return leftTitle < rightTitle
	})

	langPrefix := ""
	if lang == "en_US" {
		langPrefix = "/en_US"
	}

	links := make([]render.TagLink, 0, len(canonicalIDs))
	for index, id := range canonicalIDs {
		title := tagRegistry.GetTitle(id)
		links = append(links, render.TagLink{
			Name:         title,
			URL:          joinURL("/", langPrefix, "tags", seo.TagSlug(title)),
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

func hasTag(notes []render.NoteLink, tag string) bool {
	for _, n := range notes {
		for _, t := range n.Tags {
			if t == tag {
				return true
			}
		}
	}
	return false
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

func buildObsidianIndex(notes []content.Note, contentDir string, publicDir string, publicPath string, onProgress func(current, total int)) (obsidian.Index, error) {
	targets := make([]obsidian.Target, 0, len(notes))
	for i, note := range notes {
		if onProgress != nil {
			onProgress(i+1, len(notes))
		}
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
			URL:        note.URL,
			Section:    note.Section,
			Slug:       note.Slug,
			Summary:    note.Summary,
			Content:    note.Body,
			SourcePath: note.SourcePath,
			Headings:   headings,
			Blocks:     blocks,
		})
	}

	var attachments []obsidian.Attachment
	if _, err := os.Stat(contentDir); err == nil {
		err = filepath.WalkDir(contentDir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}

			relPath, err := filepath.Rel(contentDir, path)
			if err != nil {
				return nil
			}
			relPath = filepath.ToSlash(relPath)

			if d.IsDir() {
				// Ignore hidden folders like .obsidian, .git
				if shouldSkipVaultDir(contentDir, relPath, publicDir) {
					return filepath.SkipDir
				}
				return nil
			}

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
				// Ignore unsupported files
				return nil
			}

			pubMode := "local"
			pubURL := publicPath + escapeURLPath(relPath)
			info, err := d.Info()
			if err == nil && info.Size() > 25*1024*1024 {
				fmt.Printf("[obsidian] local attachment may exceed Pages single-file limit: %s\n", d.Name())
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

	appJSONPath := filepath.Join(contentDir, ".obsidian", "app.json")
	var appJSON struct {
		AttachmentFolderPath string `json:"attachmentFolderPath"`
		NewLinkFormat        string `json:"newLinkFormat"`
	}
	if b, err := os.ReadFile(appJSONPath); err == nil {
		_ = json.Unmarshal(b, &appJSON)
	}

	return obsidian.NewIndex(targets, attachments, publicPath, appJSON.AttachmentFolderPath, appJSON.NewLinkFormat), nil
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

func shouldSkipVaultDir(contentDir, relativePath, publicDir string) bool {
	base := filepath.Base(relativePath)
	if base != "." && strings.HasPrefix(base, ".") {
		return true
	}

	absPath, errPath := filepath.Abs(filepath.Join(contentDir, relativePath))
	absPublic, errPub := filepath.Abs(publicDir)
	if errPath == nil && errPub == nil {
		rel, err := filepath.Rel(absPublic, absPath)
		if err == nil && (rel == "." || !strings.HasPrefix(rel, ".."+string(filepath.Separator))) && rel != ".." {
			// Actually just strings.HasPrefix(rel, "..") is enough to check if it's OUTSIDE.
			// But careful with exact matches, we skip if inside.
			if rel == "." || !strings.HasPrefix(rel, "..") {
				return true
			}
		}
	}

	return false
}

func copyAttachments(contentDir, publicDir string) error {
	err := copyDirFiltered(contentDir, publicDir, func(relativePath string, entry os.DirEntry) bool {
		if entry.IsDir() {
			if shouldSkipVaultDir(contentDir, relativePath, publicDir) {
				return true // skip .obsidian, .git, and output publicDir
			}
			return false // allow traversing other dirs
		}

		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !obsidian.IsImageExt(ext) && ext != ".pdf" && !obsidian.IsAudioExt(ext) && !obsidian.IsVideoExt(ext) {
			return true // Skip unsupported (md, etc)
		}

		return false // Copy local media files
	})

	return err
}

func Serve(publicDir, address string) error {
	if _, err := os.Stat(publicDir); err != nil {
		return fmt.Errorf("public directory not found; run `daybook build` first: %w", err)
	}

	previewAddress := address
	if strings.HasPrefix(previewAddress, ":") {
		previewAddress = "localhost" + previewAddress
	}
	fmt.Println("预览地址: http://" + previewAddress)
	fileServer := previewHandler(publicDir)
	mux := http.NewServeMux()
	mux.Handle("/", fileServer)

	if err := http.ListenAndServe(address, mux); err != nil {
		return fmt.Errorf("启动预览服务器: %w", err)
	}

	return nil
}

func previewHandler(publicDir string) http.Handler {
	fileServer := http.FileServer(http.Dir(publicDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Custom giscus themes and their fonts are loaded by its cross-origin
		// iframe. Match the public static asset rules in the embedded _headers.
		if strings.HasPrefix(r.URL.Path, "/immutable/css/components/giscus-") && strings.HasSuffix(r.URL.Path, ".css") ||
			strings.HasPrefix(r.URL.Path, "/immutable/vendor/fonts/") {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		fileServer.ServeHTTP(w, r)
	})
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
