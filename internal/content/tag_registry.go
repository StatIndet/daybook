package content

import (
	"strings"
)

type TagRegistry struct {
	displayNames map[string]string
}

func NewTagRegistry(notes []Note) (*TagRegistry, error) {
	reg := &TagRegistry{
		displayNames: make(map[string]string),
	}

	for _, note := range notes {
		for _, rawTag := range note.Tags {
			rawTag = strings.TrimSpace(rawTag)
			if rawTag == "" {
				continue
			}

			canonicalID := slugifyTag(rawTag)
			if reg.displayNames[canonicalID] == "" {
				reg.displayNames[canonicalID] = rawTag
			}
		}
	}

	return reg, nil
}

func slugifyTag(text string) string {
	text = strings.ToLower(strings.TrimSpace(text))
	text = strings.ReplaceAll(text, " ", "-")
	text = strings.ReplaceAll(text, "/", "-")
	return text
}

func (reg *TagRegistry) GetID(rawTag string) string {
	return slugifyTag(rawTag)
}

func (reg *TagRegistry) GetTitle(canonicalID string) string {
	if name, ok := reg.displayNames[canonicalID]; ok && name != "" {
		return name
	}
	return canonicalID
}

func (reg *TagRegistry) Resolve(rawTag string) (string, string) {
	id := reg.GetID(rawTag)
	title := reg.GetTitle(id)
	return id, title
}
