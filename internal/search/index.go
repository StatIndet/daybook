package search

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"

	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/morphable"
)

type IndexVersion struct {
	Title          string        `json:"title"`
	Summary        string        `json:"summary"`
	Tags           []string      `json:"tags"`
	TagIDs         []string      `json:"tagIDs"`
	Date           string        `json:"date"`
	URL            string        `json:"url"`
	ReadingTime    string        `json:"readingTime"`
	ReadingMinutes int           `json:"readingMinutes"`
	Updated        string        `json:"updated"`
	Slug           string        `json:"slug"`
	Pin            bool          `json:"pin"`
	HasMusic       bool          `json:"hasMusic"`
	HasTranslation bool          `json:"hasTranslation"`
	TitleLayout    template.HTML `json:"titleLayout"`
}

type IndexItem struct {
	I18nKey  string                  `json:"i18n_key"`
	Versions map[string]IndexVersion `json:"versions"`
}

func BuildIndex(groups []*content.ArticleGroup, estimateReadingTime func(string) string, tagRegistry *content.TagRegistry, outputPath string) error {
	var items []IndexItem

	for _, group := range groups {
		versions := make(map[string]IndexVersion)
		hasTranslation := len(group.Versions) > 1

		for lang, note := range group.Versions {
			if note.Draft {
				continue
			}

			var tagIDs []string
			var displayTags []string
			seenTags := make(map[string]bool)

			for _, rawTag := range note.Tags {
				canonicalID := tagRegistry.GetID(rawTag)
				if seenTags[canonicalID] {
					continue
				}
				seenTags[canonicalID] = true
				displayTags = append(displayTags, tagRegistry.GetTitle(canonicalID))
				tagIDs = append(tagIDs, canonicalID)
			}

			titleLayoutHTML := morphable.GenerateHTML(note.Title, note.Slug, "title")

			versions[lang] = IndexVersion{
				Title:          note.Title,
				Summary:        note.Summary,
				Tags:           displayTags,
				TagIDs:         tagIDs,
				Date:           note.Date,
				URL:            note.URL,
				ReadingTime:    estimateReadingTime(note.Body),
				ReadingMinutes: note.ReadingMinutes,
				Updated:        note.Updated,
				Slug:           note.Slug,
				Pin:            note.Pin,
				HasMusic:       note.HasMusic,
				HasTranslation: hasTranslation,
				TitleLayout:    titleLayoutHTML,
			}
		}

		if len(versions) == 0 {
			continue
		}

		items = append(items, IndexItem{
			I18nKey:  group.I18nKey,
			Versions: versions,
		})
	}

	data, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("序列化搜索索引: %w", err)
	}

	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("写入搜索索引文件: %w", err)
	}

	return nil
}
