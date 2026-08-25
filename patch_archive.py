import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# Add ArchiveChunk struct at the top or near it
archive_chunk_struct = """type ArchiveChunk struct {
	YearGroups []render.ArchiveYearGroup `json:"groups"`
	NextChunk  string                    `json:"nextChunk"`
}
"""

content = content.replace("type BuildResult struct {", archive_chunk_struct + "\ntype BuildResult struct {")

old_block = """		archiveData := render.ArchiveData{
			Site:         siteData,
			Config:       options.Config,
			PageTitle:    i18n.T(lang, "nav.archive"),
			PageKind:     "archive",
			BodyClass:    "archive-body page-body",
			Lang:         lang,
			AlternateURL: joinURL("/", altLangPrefix, "archive"),
			Assets:       assets,
			Total:        len(noteLinks),
			YearGroups:   archiveYearGroups(noteLinks),
			Tags:         tagLinks,
			SEO:          seo.BuildForCollection(archiveSEOArgs),
		}
		if err := renderer.RenderArchive(archivePath, archiveData); err != nil {
			return BuildResult{}, fmt.Errorf("生成归档页: %w", err)
		}"""

new_block = """		var firstPageNotes []render.NoteLink
		if len(noteLinks) > PageSize {
			firstPageNotes = noteLinks[:PageSize]
		} else {
			firstPageNotes = noteLinks
		}

		nextChunkURL := ""
		if len(noteLinks) > PageSize {
			nextChunkURL = joinURL("/", langPrefix, "archive", "chunks", "2.json")
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
			YearGroups:   archiveYearGroups(firstPageNotes),
			NextChunkURL: nextChunkURL,
			Tags:         tagLinks,
			SEO:          seo.BuildForCollection(archiveSEOArgs),
		}
		if err := renderer.RenderArchive(archivePath, archiveData); err != nil {
			return BuildResult{}, fmt.Errorf("生成归档页: %w", err)
		}

		// Generate chunks
		totalPages := int(math.Ceil(float64(len(noteLinks)) / float64(PageSize)))
		for p := 2; p <= totalPages; p++ {
			startIdx := (p - 1) * PageSize
			endIdx := startIdx + PageSize
			if endIdx > len(noteLinks) {
				endIdx = len(noteLinks)
			}
			
			chunkNotes := noteLinks[startIdx:endIdx]
			
			chunkNextURL := ""
			if p < totalPages {
				chunkNextURL = joinURL("/", langPrefix, "archive", "chunks", fmt.Sprintf("%d.json", p+1))
			}
			
			chunk := ArchiveChunk{
				YearGroups: archiveYearGroups(chunkNotes),
				NextChunk:  chunkNextURL,
			}
			
			chunkDir := filepath.Join(langPublicDir, "archive", "chunks")
			if err := os.MkdirAll(chunkDir, 0755); err != nil {
				return BuildResult{}, err
			}
			
			chunkPath := filepath.Join(chunkDir, fmt.Sprintf("%d.json", p))
			data, err := json.Marshal(chunk)
			if err != nil {
				return BuildResult{}, err
			}
			if err := os.WriteFile(chunkPath, data, 0644); err != nil {
				return BuildResult{}, err
			}
		}"""

content = content.replace(old_block, new_block)

with open("internal/site/site.go", "w") as f:
    f.write(content)
