package search

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/StatIndet/daybook/internal/content"
)

type IndexItem struct {
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Tags        []string `json:"tags"`
	Date        string   `json:"date"`
	URL         string   `json:"url"`
	ReadingTime string   `json:"readingTime"`
}

func BuildIndex(notes []content.Note, estimateReadingTime func(string) string, outputPath string) error {
	var items []IndexItem

	for _, note := range notes {
		if note.Draft {
			continue
		}

		items = append(items, IndexItem{
			Title:       note.Title,
			Summary:     note.Summary,
			Tags:        note.Tags,
			Date:        note.Date,
			URL:         note.URL,
			ReadingTime: estimateReadingTime(note.Body),
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
