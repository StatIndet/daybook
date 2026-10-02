package site

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
)

func TestBuildGiscusComments(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(vault, "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout this blog.")
	writeTestFile(t, vault, "notes/default.md", "---\ntitle: Default\ndate: 2026-10-01\n---\nDefault article.")
	writeTestFile(t, vault, "notes/enabled.md", "---\ntitle: Enabled\ndate: 2026-10-01\ncomment: true\n---\nEnabled article.")
	writeTestFile(t, vault, "notes/disabled.md", "---\ntitle: Disabled\ndate: 2026-10-01\ncomment: false\n---\nDisabled article.")
	writeTestFile(t, vault, "notes/english.md", "---\ntitle: English\ndate: 2026-10-01\nlang: en_US\n---\nEnglish article.")
	complete := config.CommentConfig{
		Enabled:  true,
		Provider: "giscus",
		Giscus:   config.GiscusConfig{Repo: "owner/blog", RepoID: "R_repo", Category: "Announcements", CategoryID: "DIC_category"},
	}
	for _, test := range []struct {
		name    string
		comment config.CommentConfig
		enabled bool
	}{
		{name: "enabled", comment: complete, enabled: true},
		{name: "globally disabled", comment: config.CommentConfig{Provider: complete.Provider, Giscus: complete.Giscus}},
		{name: "incomplete", comment: config.CommentConfig{Enabled: true, Provider: complete.Provider}},
		{name: "unsupported", comment: config.CommentConfig{Enabled: true, Provider: "other", Giscus: complete.Giscus}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := Build(Options{
				Config:     config.Config{Comment: test.comment},
				ContentDir: vault,
				NotesDir:   filepath.Join(vault, "notes"),
				PublicDir:  publicDir,
			})
			if err != nil {
				t.Fatal(err)
			}
			var manifest map[string]string
			manifestBytes, err := os.ReadFile(filepath.Join(publicDir, "assets-manifest.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
				t.Fatal(err)
			}
			for _, route := range []string{"/notes/default/", "/notes/enabled/", "/notes/disabled/", "/en_US/notes/english/"} {
				html := readPublicAsset(t, publicDir, route+"index.html")
				wantComments := test.enabled && route != "/notes/disabled/"
				if strings.Contains(html, `id="giscus"`) != wantComments {
					t.Fatalf("%s: giscus presence does not match global/config and per-note gates", route)
				}
				if !wantComments {
					continue
				}
				for _, attr := range []string{`data-repo="owner/blog"`, `data-repo-id="R_repo"`, `data-category="Announcements"`, `data-category-id="DIC_category"`, `data-path="` + route + `"`} {
					if !strings.Contains(html, attr) {
						t.Fatalf("%s: missing giscus configuration attribute %s", route, attr)
					}
				}
				lang := "zh-CN"
				if strings.HasPrefix(route, "/en_US/") {
					lang = "en"
				}
				if !strings.Contains(html, `data-lang="`+lang+`"`) {
					t.Fatalf("%s: giscus language must follow page UI", route)
				}
				for _, variant := range []string{"default-light", "default-dark", "warm-light", "warm-dark"} {
					assetPath := manifest["/css/components/giscus-"+variant+".css"]
					if !strings.HasPrefix(assetPath, "/immutable/") || !strings.Contains(html, `data-theme-`+variant+`="`+assetPath+`"`) {
						t.Fatalf("%s: giscus theme %s must use a published immutable CSS path", route, variant)
					}
				}
			}
		})
	}
}

func TestPreviewGiscusAssetCORS(t *testing.T) {
	publicDir := t.TempDir()
	for _, assetPath := range []string{
		"immutable/css/components/giscus-default-light.test.css",
		"immutable/vendor/fonts/example/font.test.woff2",
		"immutable/vendor/fonts/example/font.test.css",
		"immutable/css/global.test.css",
		"index.html",
	} {
		writeTestFile(t, publicDir, assetPath, "asset")
	}
	handler := previewHandler(publicDir)
	for _, test := range []struct {
		path string
		cors bool
	}{
		{path: "/immutable/css/components/giscus-default-light.test.css", cors: true},
		{path: "/immutable/vendor/fonts/example/font.test.woff2", cors: true},
		{path: "/immutable/vendor/fonts/example/font.test.css", cors: true},
		{path: "/immutable/css/global.test.css"},
		{path: "/"},
	} {
		t.Run(test.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			request.Header.Set("Origin", "https://giscus.app")
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("preview asset returned HTTP %d", recorder.Code)
			}
			if (recorder.Header().Get("Access-Control-Allow-Origin") == "*") != test.cors {
				t.Fatalf("unexpected CORS policy for %s: %v", test.path, recorder.Header())
			}
		})
	}
}
