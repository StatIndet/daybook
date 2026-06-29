package sitemap

import (
	"encoding/xml"
	"fmt"
	"os"
	"strings"

	"github.com/StatIndet/daybook/internal/config"
)

type URL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type urlset struct {
	XMLName xml.Name `xml:"http://www.sitemaps.org/schemas/sitemap/0.9 urlset"`
	URLs    []URL    `xml:"url"`
}

func WriteSitemap(outputPath string, cfg config.Config, urls []URL) error {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")

	var finalURLs []URL
	for _, u := range urls {
		loc := baseURL + u.Loc
		finalURLs = append(finalURLs, URL{
			Loc:     loc,
			LastMod: u.LastMod,
		})
	}

	set := urlset{URLs: finalURLs}
	data, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal sitemap: %w", err)
	}

	content := []byte(xml.Header + string(data))
	if err := os.WriteFile(outputPath, content, 0644); err != nil {
		return fmt.Errorf("write sitemap: %w", err)
	}

	return nil
}

func WriteRobots(outputPath string, cfg config.Config) error {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	sitemapURL := baseURL + "/sitemap.xml"

	content := fmt.Sprintf("User-agent: *\nAllow: /\n\nSitemap: %s\n", sitemapURL)

	if err := os.WriteFile(outputPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("write robots.txt: %w", err)
	}

	return nil
}
