package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadGiscusConfig(t *testing.T) {
	complete := `comment:
  enabled: true
  provider: " giscus "
  giscus:
    repo: " owner/blog "
    repoId: " R_repo "
    category: " Announcements "
    categoryId: " DIC_category "
`
	for _, test := range []struct {
		name    string
		config  string
		enabled bool
	}{
		{name: "complete", config: complete, enabled: true},
		{name: "globally disabled", config: strings.Replace(complete, "enabled: true", "enabled: false", 1)},
		{name: "missing repository", config: strings.Replace(complete, `repo: " owner/blog "`, `repo: " "`, 1)},
		{name: "missing repository ID", config: strings.Replace(complete, `repoId: " R_repo "`, `repoId: " "`, 1)},
		{name: "missing category", config: strings.Replace(complete, `category: " Announcements "`, `category: " "`, 1)},
		{name: "missing category ID", config: strings.Replace(complete, `categoryId: " DIC_category "`, `categoryId: " "`, 1)},
		{name: "unknown provider", config: strings.Replace(complete, `provider: " giscus "`, `provider: other`, 1)},
		{name: "missing provider", config: strings.Replace(complete, `provider: " giscus "`, `provider: ""`, 1)},
		{name: "legacy Waline", config: "comment:\n  enabled: true\n  provider: waline\n  waline:\n    serverURL: https://comments.example.com\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			vault := t.TempDir()
			t.Chdir(vault)
			if err := os.WriteFile(filepath.Join(vault, "daybook.yaml"), []byte(test.config), 0644); err != nil {
				t.Fatal(err)
			}
			cfg, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Comment.Enabled != test.enabled || cfg.Comment.Available() != test.enabled {
				t.Fatalf("comment enabled = %v, available = %v, want %v", cfg.Comment.Enabled, cfg.Comment.Available(), test.enabled)
			}
			if test.name == "complete" && cfg.Comment.Giscus != (GiscusConfig{Repo: "owner/blog", RepoID: "R_repo", Category: "Announcements", CategoryID: "DIC_category"}) {
				t.Fatalf("giscus fields were not normalized: %#v", cfg.Comment.Giscus)
			}
		})
	}
}
