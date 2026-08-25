import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# I need to find `allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix, "notes")})`
# and remove it or change it so that I append all pages. Wait, in my `for p := 1; p <= totalPages` block, I can append to `allSiteURLs`.

# Actually, I can just append `pageURL` to `allSiteURLs` inside the loop. Let me modify `patch_notes.py`'s replacement slightly.
# Since `allSiteURLs` is a local slice, I can append to it.

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
			
			allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: pageURL})
"""

# Wait, `allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix, "notes")})` is already present further down. Let's remove it.

content = content.replace('allSiteURLs = append(allSiteURLs, sitemap.URL{Loc: joinURL("/", langPrefix, "notes")})', '')

# We also need to add the pagination pages to `allSiteURLs`. We can do this right inside the loop. Let me re-run a Python script to do this.

# Let's insert the `allSiteURLs = append(...)` in the notes rendering loop.

search_str = 'if err := renderer.RenderNotes(pagePath, notesData); err != nil {\n\t\t\t\treturn BuildResult{}, fmt.Errorf("生成文章页: %w", err)\n\t\t\t}'
replace_str = 'if err := renderer.RenderNotes(pagePath, notesData); err != nil {\n\t\t\t\treturn BuildResult{}, fmt.Errorf("生成文章页: %w", err)\n\t\t\t}\n\t\t\tallSiteURLs = append(allSiteURLs, sitemap.URL{Loc: pageURL})'

content = content.replace(search_str, replace_str)

with open("internal/site/site.go", "w") as f:
    f.write(content)
