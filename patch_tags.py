import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# I need to match the block from `for _, tagLink := range tagLinks {` to `if err := renderer.RenderTag... }`
# I will use a regex to replace it.

old_block = """		for _, tagLink := range tagLinks {
			var tagNotes []render.NoteLink

			// filter notes
			for _, n := range noteLinks {
				for _, displayTag := range n.Tags {
					if displayTag == tagLink.Name {
						tagNotes = append(tagNotes, n)
						break
					}
				}
			}
			tagAlternates := []seo.Alternate{{Lang: lang, URL: tagLink.URL}}

			hasAlt := false
			for _, grp := range groups {
				var altNote *content.Note
				if lang == "zh-CN" {
					if n, ok := grp.Versions["en"]; ok {
						altNote = n
					}
				} else if lang == "en" {
					if n, ok := grp.Versions["zh-CN"]; ok {
						altNote = n
					}
				}
				if altNote != nil {
					for _, t := range altNote.Tags {
						if t == tagLink.Name {
							hasAlt = true
							break
						}
					}
				}
				if hasAlt {
					break
				}
			}

			if hasAlt {
				tagAlternates = append(tagAlternates, seo.Alternate{Lang: altLangPrefix, URL: joinURL("/", altLangPrefix, "tags", seo.TagSlug(tagLink.Name))})
			}
			tagSEOArgs := seo.BuilderArgs{
				Config:      options.Config,
				Lang:        lang,
				Title:       "#" + tagLink.Name,
				Description: fmt.Sprintf(i18n.T(lang, "seo.tag.description"), tagLink.Name),
				PageURL:     tagLink.URL,
				Alternates:  tagAlternates,
			}

			tagData := render.TagData{
				Site:         siteData,
				Config:       options.Config,
				PageTitle:    "#" + tagLink.Name,
				PageKind:     "tag",
				BodyClass:    "tag-body page-body",
				Lang:         lang,
				AlternateURL: joinURL("/", altLangPrefix, "tags", seo.TagSlug(tagLink.Name)),
				Assets:       assets,
				Notes:        tagNotes,
				Tags:         tagLinks,
				SEO:          seo.BuildForTag(tagSEOArgs),
			}

			tagOut := filepath.Join(langPublicDir, "tags", seo.TagSlug(tagLink.Name), "index.html")
			if err := renderer.RenderTag(tagOut, tagData); err != nil {
				return BuildResult{}, fmt.Errorf("生成标签页: %w", err)
			}
		}"""

new_block = """		for _, tagLink := range tagLinks {
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

				hasAlt := false
				for _, grp := range groups {
					var altNote *content.Note
					if lang == "zh-CN" {
						if n, ok := grp.Versions["en"]; ok {
							altNote = n
						}
					} else if lang == "en" {
						if n, ok := grp.Versions["zh-CN"]; ok {
							altNote = n
						}
					}
					if altNote != nil {
						for _, t := range altNote.Tags {
							if t == tagLink.Name {
								hasAlt = true
								break
							}
						}
					}
					if hasAlt {
						break
					}
				}

				if hasAlt {
					altURL := joinURL("/", altLangPrefix, "tags", seo.TagSlug(tagLink.Name))
					if p > 1 {
						altURL = joinURL(altURL, "page", fmt.Sprintf("%d", p))
					}
					tagAlternates = append(tagAlternates, seo.Alternate{Lang: altLangPrefix, URL: altURL})
				}

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
				
				altURL := joinURL("/", altLangPrefix, "tags", seo.TagSlug(tagLink.Name))
				if p > 1 {
					altURL = joinURL(altURL, "page", fmt.Sprintf("%d", p))
				}

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
				aliasHTML := fmt.Sprintf(` + "`" + `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>` + "`" + `, baseTagPath, baseTagPath)
				os.WriteFile(page1AliasPath, []byte(aliasHTML), 0644)
			}
		}"""

content = content.replace(old_block, new_block)

# Wait, `allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: tagLink.URL})` is at the bottom of `site.go` as well. We should remove it.
content = content.replace('\t\tfor _, tagLink := range tagLinks {\n\t\t\tallSiteURLs = append(allSiteURLs, sitemap.URL{Loc: tagLink.URL})\n\t\t}', '')

with open("internal/site/site.go", "w") as f:
    f.write(content)
