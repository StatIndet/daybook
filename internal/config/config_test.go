package config

import (
	"testing"
)

func TestParseSocialLinks(t *testing.T) {
	configs := []SocialLinkConfig{
		{Type: "github", URL: "https://github.com/foo"},
		{Type: "bilibili", URL: "https://bilibili.com/foo"},
	}

	links := parseSocialLinks(configs)
	if len(links) != 2 {
		t.Fatalf("Expected 2 links, got %d", len(links))
	}

	if links[0].Type != "github" || links[0].Label != "GitHub" {
		t.Errorf("Expected GitHub, got %v", links[0])
	}

	if links[1].Type != "bilibili" || links[1].Label != "Bilibili" {
		t.Errorf("Expected Bilibili, got %v", links[1])
	}
}
