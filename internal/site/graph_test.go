package site

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/graph"
)

func TestBuildGraphSearchPublishesSafePathsAndApprovedData(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout")
	writeTestFile(t, vault, "notes/中文 folder/first.md", "---\ndate: 2026-10-01\ntags: [知识/图谱]\nstatus: public-approved\nsecret: private-property-value\n---\nIntro\n\n## 第一章\n甲\n乙\n\n%% private-comment-value %%\n\n<!-- private-html-value -->\n\n```md\n# code-not-heading\n```\n\n## 第二章\n丙\n\n[[second]] ![[photo.png]] [[missing]]")
	writeTestFile(t, vault, "notes/second.md", "---\ndate: 2026-10-02\nlang: en_US\n---\n[[first]]")
	writeTestFile(t, vault, "notes/draft.md", "---\ndate: 2026-10-03\ndraft: true\nstatus: draft-property-value\n---\ndraft-body-value")
	writeTestFile(t, vault, "notes/assets/photo.png", "fixture-attachment")
	_, err := Build(Options{Config: config.Config{Graph: config.GraphConfig{SearchProperties: []string{"status"}}}, ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir})
	if err != nil {
		t.Fatal(err)
	}
	for _, prefix := range []string{"", "/en_US"} {
		graphJSON := readPublicAsset(t, publicDir, prefix+"/graph.json")
		searchJSON := readPublicAsset(t, publicDir, prefix+"/graph-search.json")
		for _, private := range []string{vault, "private-property-value", "private-comment-value", "private-html-value", "draft-body-value", "draft-property-value"} {
			if strings.Contains(graphJSON, private) || strings.Contains(searchJSON, private) {
				t.Errorf("%s graph artifacts contain private value %q", prefix, private)
			}
		}
		var data graph.Data
		if err := json.Unmarshal([]byte(graphJSON), &data); err != nil {
			t.Fatal(err)
		}
		if data.Version != 1 || len(data.Nodes) != 3 || len(data.Links) != 3 {
			t.Fatalf("unexpected version/nodes/directed links: %+v", data)
		}
		var first graph.Node
		for _, node := range data.Nodes {
			if node.Title == "first" {
				first = node
			}
		}
		if first.Path != "notes/中文 folder/first.md" || first.File != "first.md" || first.Degree != 2 {
			t.Fatalf("unexpected public path/degree: %+v", first)
		}
		if len(first.Attachments) != 1 || first.Attachments[0].Path != "notes/assets/photo.png" || first.Attachments[0].File != "photo.png" {
			t.Fatalf("attachment lost path metadata: %+v", first.Attachments)
		}
		var search graph.SearchData
		if err := json.Unmarshal([]byte(searchJSON), &search); err != nil {
			t.Fatal(err)
		}
		if search.Version != 1 || len(search.Documents) != 2 {
			t.Fatalf("unexpected search index: %+v", search)
		}
		for _, doc := range search.Documents {
			if doc.ID == first.ID {
				if len(doc.Sections) != 3 || !strings.Contains(doc.Sections[1], "code-not-heading") || doc.Properties["status"] != "public-approved" {
					t.Errorf("search document lost sections/approved metadata: %+v", doc)
				}
			}
		}
	}
}
