package content

import (
	"fmt"
	"sort"
)

type ArticleGroup struct {
	Key      string
	I18nKey  string
	Versions map[string]*Note
}

// PublishedVersions returns every published version in a stable order. UI
// language chooses interface labels, never which article versions are listed.
func (g *ArticleGroup) PublishedVersions() []*Note {
	var notes []*Note
	for _, lang := range []string{"zh_CN", "en_US"} {
		if note := g.Versions[lang]; note != nil && !note.Draft {
			notes = append(notes, note)
		}
	}
	return notes
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
	// Prefer zh_CN if it exists
	if note, ok := g.Versions["zh_CN"]; ok {
		return note, true
	}
	// Prefer en if it exists
	if note, ok := g.Versions["en_US"]; ok {
		return note, true
	}
	// Pick whatever is first
	for _, note := range g.Versions {
		return note, true
	}
	return nil, false
}

// GroupNotes takes a flat slice of Notes and groups them into ArticleGroups.
func GroupNotes(notes []Note) ([]*ArticleGroup, error) {
	groupsMap := make(map[string]*ArticleGroup)

	for i := range notes {
		note := &notes[i]

		groupKey := note.I18nKey
		if groupKey == "" {
			groupKey = "single:" + note.Lang + ":" + note.Slug
		}
		if note.Section != "" {
			groupKey = note.Section + ":" + groupKey
		}

		group, ok := groupsMap[groupKey]
		if !ok {
			group = &ArticleGroup{
				Key:      groupKey,
				I18nKey:  note.I18nKey, // might be empty
				Versions: make(map[string]*Note),
			}
			groupsMap[groupKey] = group
		}

		if _, exists := group.Versions[note.Lang]; exists {
			return nil, fmt.Errorf("GroupKey %s 包含多个 %s 语言版本", groupKey, note.Lang)
		}

		group.Versions[note.Lang] = note
	}

	var groups []*ArticleGroup
	for _, g := range groupsMap {
		groups = append(groups, g)
	}

	sort.SliceStable(groups, func(i, j int) bool {
		// Use zh_CN date to sort, or fallback
		noteI, _ := groups[i].SelectVersion("zh_CN")
		noteJ, _ := groups[j].SelectVersion("zh_CN")

		if noteI == nil || noteJ == nil {
			return false
		}

		if CompareDates(noteI.Date, noteJ.Date) == 0 {
			return noteI.Title < noteJ.Title
		}
		return CompareDates(noteI.Date, noteJ.Date) > 0
	})

	return groups, nil
}
