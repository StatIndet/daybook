package feed

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/render"
)

type rss struct {
	XMLName xml.Name `xml:"rss"`
	Version string   `xml:"version,attr"`
	Channel channel  `xml:"channel"`
}

type channel struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	Items       []item `xml:"item"`
}

type item struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description,omitempty"`
	PubDate     string `xml:"pubDate,omitempty"`
}

func Write(path string, cfg config.Config, notes []render.NoteLink) error {
	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	document := rss{
		Version: "2.0",
		Channel: channel{
			Title:       cfg.Title,
			Link:        baseURL + "/",
			Description: cfg.Title,
			Items:       make([]item, 0, len(notes)),
		},
	}

	for _, note := range notes {
		link := baseURL + note.URL
		document.Channel.Items = append(document.Channel.Items, item{
			Title:       note.Title,
			Link:        link,
			GUID:        link,
			Description: note.Summary,
			PubDate:     rssDate(note.Date),
		})
	}

	data, err := xml.MarshalIndent(document, "", "  ")
	if err != nil {
		return fmt.Errorf("生成 RSS XML: %w", err)
	}
	data = append([]byte(xml.Header), data...)
	data = append(data, '\n')

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("创建 RSS 输出目录: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("写入 RSS 文件: %w", err)
	}

	return nil
}

func rssDate(date string) string {
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return ""
	}
	return parsed.Format(time.RFC1123Z)
}
