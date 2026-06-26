package content

import (
	"fmt"
	"strings"
)

type TagRegistry struct {
	aliases map[string]string            // raw_tag_lower -> canonical_tag_id
	infos   map[string]map[string]string // canonical_tag_id -> lang -> Name
}

func NewTagRegistry(notes []Note) (*TagRegistry, error) {
	reg := &TagRegistry{
		aliases: make(map[string]string),
		infos:   make(map[string]map[string]string),
	}

	type tagGroup struct {
		enSlug  string
		rawSlug string
		names   map[string]string
		aliases []string
	}

	groups := make(map[string]*tagGroup)

	for _, note := range notes {
		for i, rawTag := range note.Tags {
			rawTag = strings.TrimSpace(rawTag)
			if rawTag == "" {
				continue
			}
			rawKey := strings.ToLower(rawTag)

			var enTag, zhTag string
			if note.Lang == "zh-CN" {
				if i < len(note.TagsEn) {
					enTag = strings.TrimSpace(note.TagsEn[i])
				}
			} else if note.Lang == "en" {
				if i < len(note.TagsZh) {
					zhTag = strings.TrimSpace(note.TagsZh[i])
				}
			}

			var keys []string
			keys = append(keys, rawKey)
			if enTag != "" {
				keys = append(keys, strings.ToLower(enTag))
			}
			if zhTag != "" {
				keys = append(keys, strings.ToLower(zhTag))
			}

			var existingGroup *tagGroup
			for _, k := range keys {
				if g, ok := groups[k]; ok {
					if existingGroup != nil && existingGroup != g {
						return nil, fmt.Errorf("Tag alias conflict detected: %s maps to multiple different tag concepts", k)
					}
					existingGroup = g
				}
			}

			if existingGroup == nil {
				existingGroup = &tagGroup{
					names: make(map[string]string),
				}
			}

			for _, k := range keys {
				groups[k] = existingGroup

				found := false
				for _, a := range existingGroup.aliases {
					if a == k {
						found = true
						break
					}
				}
				if !found {
					existingGroup.aliases = append(existingGroup.aliases, k)
				}
			}

			if existingGroup.names[note.Lang] == "" {
				existingGroup.names[note.Lang] = rawTag
			}
			if existingGroup.names[""] == "" {
				existingGroup.names[""] = rawTag // fallback default
			}
			if existingGroup.rawSlug == "" {
				existingGroup.rawSlug = rawKey
			}

			if enTag != "" {
				if existingGroup.names["en"] == "" {
					existingGroup.names["en"] = enTag
				}
				if existingGroup.enSlug == "" {
					existingGroup.enSlug = strings.ToLower(enTag)
				}
			}

			if zhTag != "" {
				if existingGroup.names["zh-CN"] == "" {
					existingGroup.names["zh-CN"] = zhTag
				}
			}
		}
	}

	for _, g := range groups {
		var canonicalID string
		if g.enSlug != "" {
			canonicalID = g.enSlug
		} else {
			canonicalID = g.rawSlug
		}

		canonicalID = slugifyTag(canonicalID)

		if reg.infos[canonicalID] == nil {
			reg.infos[canonicalID] = make(map[string]string)
		}

		for lang, name := range g.names {
			if reg.infos[canonicalID][lang] == "" {
				reg.infos[canonicalID][lang] = name
			}
		}

		for _, alias := range g.aliases {
			reg.aliases[alias] = canonicalID
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
	rawKey := strings.ToLower(strings.TrimSpace(rawTag))
	if canonical, ok := reg.aliases[rawKey]; ok {
		return canonical
	}
	return slugifyTag(rawTag)
}

func (reg *TagRegistry) GetTitle(canonicalID, lang string) string {
	info, ok := reg.infos[canonicalID]
	if !ok {
		return canonicalID
	}

	if name, ok := info[lang]; ok && name != "" {
		return name
	}
	if name, ok := info[""]; ok && name != "" {
		return name
	}

	for _, name := range info {
		if name != "" {
			return name
		}
	}
	return canonicalID
}

func (reg *TagRegistry) Resolve(rawTag, lang string) (string, string) {
	id := reg.GetID(rawTag)
	title := reg.GetTitle(id, lang)
	return id, title
}
