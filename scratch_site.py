import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

target = """	var neteaseSongIDs []string
	neteaseRegex := regexp.MustCompile(`(?s)::netease\\s*\\{[^}]*id="([^"]+)"[^}]*\\}`)
	seenSongs := make(map[string]bool)
	for _, note := range allNotes {
		matches := neteaseRegex.FindAllStringSubmatch(note.Body, -1)
		for _, match := range matches {
			if len(match) > 1 {
				id := match[1]
				if !seenSongs[id] {
					seenSongs[id] = true
					neteaseSongIDs = append(neteaseSongIDs, id)
				}
			}
		}
	}

	siteData := render.SiteData{
		Title:          options.Config.Title,
		StartedAt:      startedAt,
		TotalWordCount: totalWordCount,
		NeteaseSongIDs: neteaseSongIDs,
	}"""

replacement = """	var neteaseSongs []render.NeteaseSong
	neteaseRegex := regexp.MustCompile(`(?s)::netease\\s*\\{[^}]*id="([^"]+)"[^}]*\\}`)
	seenSongs := make(map[string]bool)
	for _, note := range allNotes {
		matches := neteaseRegex.FindAllStringSubmatch(note.Body, -1)
		for _, match := range matches {
			if len(match) > 1 {
				id := match[1]
				if !seenSongs[id] {
					seenSongs[id] = true
					neteaseSongs = append(neteaseSongs, render.NeteaseSong{
						ID:           id,
						ArticleTitle: note.Title,
						ArticleURL:   note.RelativeURL(),
					})
				}
			}
		}
	}

	siteData := render.SiteData{
		Title:          options.Config.Title,
		StartedAt:      startedAt,
		TotalWordCount: totalWordCount,
		NeteaseSongs:   neteaseSongs,
	}"""

content = content.replace(target, replacement)

with open("internal/site/site.go", "w") as f:
    f.write(content)

