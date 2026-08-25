import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# Replace buildArchiveRows to mark IsFirstYear
old_func = """func buildArchiveRows(notes []render.NoteLink) []render.ArchiveRow {
	var rows []render.ArchiveRow
	currentYear := ""
	lastNoteIdx := -1

	for index, note := range notes {"""

new_func = """func buildArchiveRows(notes []render.NoteLink) []render.ArchiveRow {
	var rows []render.ArchiveRow
	currentYear := ""
	lastNoteIdx := -1
	isFirstYear := true

	for index, note := range notes {"""
content = content.replace(old_func, new_func)

old_year_if = """		if year != currentYear {
			if lastNoteIdx != -1 {
				rows[lastNoteIdx].IsLastInYear = true
			}
			rows = append(rows, render.ArchiveRow{
				Type: "year",
				ID:   "year:" + year,
				Year: year,
			})
			currentYear = year
		}"""

new_year_if = """		if year != currentYear {
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
		}"""
content = content.replace(old_year_if, new_year_if)

old_bootstrap = """				var bootstrapNotes []render.NoteLink
		// Create 8 bootstrap notes for hydration to avoid empty page
		if len(noteLinks) > 8 {
			bootstrapNotes = noteLinks[:8]
		} else {
			bootstrapNotes = noteLinks
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
			Total:        len(noteLinks),
			Rows:         buildArchiveRows(bootstrapNotes),
			Tags:         tagLinks,
			SEO:          seo.BuildForCollection(archiveSEOArgs),
		}"""

new_bootstrap = """		allArchiveRows := buildArchiveRows(noteLinks)
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
			Total:        len(noteLinks),
			Rows:         bootstrapRows,
			Tags:         tagLinks,
			SEO:          seo.BuildForCollection(archiveSEOArgs),
		}"""
content = content.replace(old_bootstrap, new_bootstrap)

content = content.replace("Rows:    buildArchiveRows(noteLinks),", "Rows:    allArchiveRows,")

with open("internal/site/site.go", "w") as f:
    f.write(content)
