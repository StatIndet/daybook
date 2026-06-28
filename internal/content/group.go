package content

import (
	"fmt"
	"sort"
)

type ArticleGroup struct {
	I18nKey  string
	Versions map[string]*Note
}

func (g *ArticleGroup) HasVersion(lang string) bool {
	_, ok := g.Versions[lang]
	return ok
}

// SelectVersion selects the note for the given language environment.
// It prioritizes the requested lang. If not found, it falls back to an available version.
// The boolean return indicates if this is a fallback.
func (g *ArticleGroup) SelectVersion(lang string) (*Note, bool) {
	if note, ok := g.Versions[lang]; ok {
		return note, false
	}
	// Fallback logic
	// Prefer zh-CN if it exists
	if note, ok := g.Versions["zh-CN"]; ok {
		return note, true
	}
	// Prefer en if it exists
	if note, ok := g.Versions["en"]; ok {
		return note, true
	}
	// Pick whatever is first
	for _, note := range g.Versions {
		return note, true
	}
	return nil, false
}

func (g *ArticleGroup) IsListed() bool {
	note, _ := g.SelectVersion("zh-CN")
	if note != nil && note.Listed != nil {
		return *note.Listed
	}
	return true
}

// GroupNotes takes a flat slice of Notes and groups them into ArticleGroups.
func GroupNotes(notes []Note) ([]*ArticleGroup, error) {
	groupsMap := make(map[string]*ArticleGroup)

	for i := range notes {
		note := &notes[i]

		group, ok := groupsMap[note.I18nKey]
		if !ok {
			group = &ArticleGroup{
				I18nKey:  note.I18nKey,
				Versions: make(map[string]*Note),
			}
			groupsMap[note.I18nKey] = group
		}

		if _, exists := group.Versions[note.Lang]; exists {
			return nil, fmt.Errorf("I18nKey %s 包含多个 %s 语言版本", note.I18nKey, note.Lang)
		}

		group.Versions[note.Lang] = note
	}

	var groups []*ArticleGroup
	for _, g := range groupsMap {
		groups = append(groups, g)
	}

	sort.SliceStable(groups, func(i, j int) bool {
		// Use zh-CN date to sort, or fallback
		noteI, _ := groups[i].SelectVersion("zh-CN")
		noteJ, _ := groups[j].SelectVersion("zh-CN")

		if noteI == nil || noteJ == nil {
			return false
		}

		if noteI.Date == noteJ.Date {
			return noteI.Title < noteJ.Title
		}
		return noteI.Date > noteJ.Date
	})

	return groups, nil
}
