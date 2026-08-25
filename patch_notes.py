import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# I want to replace the block starting from `notesIndexPath := ...` to `if err := renderer.RenderNotes...`

old_block = """		notesIndexPath := filepath.Join(langPublicDir, "notes", "index.html")
		notesAlternates := []seo.Alternate{{Lang: "zh-CN", URL: "/notes/"}, {Lang: "en", URL: "/en/notes/"}}
		notesSEOArgs := seo.BuilderArgs{
			Config:      options.Config,
			Lang:        lang,
			Title:       i18n.T(lang, "nav.notes"),
			Description: i18n.T(lang, "seo.notes.description"),
			PageURL:     joinURL("/", langPrefix, "notes"),
			Alternates:  notesAlternates,
		}

		notesData := render.NotesData{
			Site:         siteData,
			Config:       options.Config,
			PageTitle:    i18n.T(lang, "nav.notes"),
			PageKind:     "notes",
			BodyClass:    "notes-list-body page-body",
			Lang:         lang,
			AlternateURL: joinURL("/", altLangPrefix, "notes"),
			Assets:       assets,
			Notes:        noteLinks,
			PinnedNotes:  pinnedNotes,
			MonthGroups:  monthGroups(regularNotes),
			Tags:         tagLinks,
			SEO:          seo.BuildForCollection(notesSEOArgs),
		}
		if err := renderer.RenderNotes(notesIndexPath, notesData); err != nil {
			return BuildResult{}, fmt.Errorf("生成文章页: %w", err)
		}"""

new_block = """		baseNotesPath := joinURL("/", langPrefix, "notes")
		
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

			notesAlternates := []seo.Alternate{{Lang: "zh-CN", URL: "/notes/"}, {Lang: "en", URL: "/en/notes/"}}
			if p > 1 {
				pageStr := fmt.Sprintf("page/%d/", p)
				notesAlternates = []seo.Alternate{{Lang: "zh-CN", URL: "/notes/" + pageStr}, {Lang: "en", URL: "/en/notes/" + pageStr}}
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
		}
		
		// Create alias redirect for page 1
		page1AliasPath := filepath.Join(langPublicDir, "notes", "page", "1", "index.html")
		if err := os.MkdirAll(filepath.Dir(page1AliasPath), 0755); err == nil {
			aliasHTML := fmt.Sprintf(` + "`" + `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>` + "`" + `, baseNotesPath, baseNotesPath)
			os.WriteFile(page1AliasPath, []byte(aliasHTML), 0644)
		}
"""

content = content.replace(old_block, new_block)

with open("internal/site/site.go", "w") as f:
    f.write(content)
