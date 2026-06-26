package search

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/StatIndet/daybook/internal/content"
)

type IndexVersion struct {
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Tags        []string `json:"tags"`
	Date        string   `json:"date"`
	URL         string   `json:"url"`
	ReadingTime string   `json:"readingTime"`
}

type IndexItem struct {
	I18nKey  string                  `json:"i18n_key"`
	Versions map[string]IndexVersion `json:"versions"`
}

func BuildIndex(groups []*content.ArticleGroup, estimateReadingTime func(string) string, outputPath string) error {
	var items []IndexItem

	for _, group := range groups {
		versions := make(map[string]IndexVersion)
		for lang, note := range group.Versions {
			if note.Draft {
				continue
			}
			tags := note.Tags
			if lang == "en" && len(note.TagsEn) > 0 {
				tags = note.TagsEn
			} else if lang == "zh-CN" && len(note.TagsZh) > 0 {
				tags = note.TagsZh
			}
			
			versions[lang] = IndexVersion{
				Title:       note.Title,
				Summary:     note.Summary,
				Tags:        tags,
				Date:        note.Date,
				URL:         note.URL,
				ReadingTime: estimateReadingTime(note.Body),
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
