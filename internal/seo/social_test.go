package seo_test

import (
	"bytes"
	"encoding/json"
	"html/template"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/embedded"
	"github.com/StatIndet/daybook/internal/seo"
)

func socialConfig() config.Config {
	return config.Config{
		Site: config.SiteConfig{URL: "https://example.com/"},
		Profile: config.ProfileConfig{Author: config.AuthorConfig{
			Name: "史帙", NameEn: "Shizhi", LogoText: "Daybook",
		}},
	}
}

func TestPostImagesUseAbsoluteURLs(t *testing.T) {
	for _, builder := range []struct {
		name  string
		build func(seo.BuilderArgs) seo.SEOData
	}{
		{"note", seo.BuildForNote},
		{"memo", seo.BuildForMemo},
	} {
		for _, tc := range []struct {
			name, image, want string
		}{
			{"generated", "/generated/og/notes/中文-a1.png", "https://example.com/generated/og/notes/中文-a1.png"},
			{"relative", "generated/og/memos/post-a1.png", "https://example.com/generated/og/memos/post-a1.png"},
			{"external", "https://images.example.net/card.png", "https://images.example.net/card.png"},
			{"protocol relative", "//images.example.net/card.png", "https://images.example.net/card.png"},
			{"empty", "", ""},
		} {
			t.Run(builder.name+"/"+tc.name, func(t *testing.T) {
				data := builder.build(seo.BuilderArgs{Config: socialConfig(), Lang: "zh_CN", Title: "中文文章", Image: tc.image})
				if data.Image != tc.want {
					t.Fatalf("Image = %q, want %q", data.Image, tc.want)
				}
				var graph struct {
					Graph []struct {
						Image string `json:"image"`
					} `json:"@graph"`
				}
				if err := json.Unmarshal([]byte(data.JSONLD), &graph); err != nil {
					t.Fatal(err)
				}
				if graph.Graph[0].Image != tc.want {
					t.Fatalf("JSON-LD image = %q, want %q", graph.Graph[0].Image, tc.want)
				}
			})
		}
	}
}

func TestMemoSocialMetadataUsesPostSemantics(t *testing.T) {
	for _, tc := range []struct {
		lang, prefix, author, collection string
	}{
		{"zh_CN", "", "史帙", "随记"},
		{"en_US", "/en_US", "Shizhi", "Memos"},
	} {
		t.Run(tc.lang, func(t *testing.T) {
			data := seo.BuildForMemo(seo.BuilderArgs{
				Config: socialConfig(), Lang: tc.lang, Title: "filename-is-not-a-social-title",
				Description: "  正文\n\t" + strings.Repeat("中文内容", 80),
				Published:   "2026-10-04T12:30:00+08:00", PageURL: tc.prefix + "/memos/中文/",
			})
			wantTitle := tc.author + " · 2026-10-04"
			if data.SocialTitle != wantTitle || data.Title != wantTitle+" | Daybook" {
				t.Fatalf("unexpected titles: social=%q browser=%q", data.SocialTitle, data.Title)
			}
			if !strings.HasPrefix(data.Description, "正文 中文内容") || !strings.HasSuffix(data.Description, "...") || utf8.RuneCountInString(data.Description) != 160 {
				t.Fatalf("description is not a bounded plain-text excerpt: %q", data.Description)
			}
			var graph struct {
				Graph []struct {
					Type            string         `json:"@type"`
					Headline        string         `json:"headline"`
					ItemListElement []seo.ListItem `json:"itemListElement"`
				} `json:"@graph"`
			}
			if err := json.Unmarshal([]byte(data.JSONLD), &graph); err != nil {
				t.Fatal(err)
			}
			if graph.Graph[0].Type != "SocialMediaPosting" || graph.Graph[0].Headline != wantTitle {
				t.Fatalf("unexpected post schema: %+v", graph.Graph[0])
			}
			collection := graph.Graph[1].ItemListElement[1]
			if collection.Name != tc.collection || collection.Item != "https://example.com"+tc.prefix+"/memos/" {
				t.Fatalf("unexpected memo breadcrumb: %+v", collection)
			}
		})
	}
}

func TestPostBuildersDoNotMutateAlternates(t *testing.T) {
	args := seo.BuilderArgs{Config: socialConfig(), Alternates: []seo.Alternate{{Lang: "zh_CN", URL: "/notes/example/"}}}
	first := seo.BuildForNote(args)
	second := seo.BuildForNote(args)
	if first.Alternates[0].URL != second.Alternates[0].URL || args.Alternates[0].URL != "/notes/example/" {
		t.Fatal("reusing builder arguments changed alternate URLs")
	}
}

type socialAssets struct{}

func (socialAssets) Path(path string) string { return path }

func renderSocialHead(t *testing.T, data seo.SEOData, pageKind string) string {
	t.Helper()
	tmpl, err := template.ParseFS(embedded.FS, "templates/partials/head.html")
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err = tmpl.ExecuteTemplate(&output, "head", map[string]any{
		"SEO": data, "PageKind": pageKind, "Lang": data.Lang,
		"Assets": socialAssets{}, "Config": socialConfig(), "HasMath": false,
	})
	if err != nil {
		t.Fatal(err)
	}
	return output.String()
}

func TestSocialHeadIncludesGeneratedImageMetadata(t *testing.T) {
	for _, tc := range []struct {
		kind  string
		build func(seo.BuilderArgs) seo.SEOData
	}{
		{"note", seo.BuildForNote},
		{"memo", seo.BuildForMemo},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			data := tc.build(seo.BuilderArgs{
				Config: socialConfig(), Lang: "zh_CN", Title: "中文标题", Published: "2026-10-04",
				Image: "/generated/og/" + tc.kind + "s/card.png", ImageWidth: 1200, ImageHeight: 630, ImageType: "image/png",
			})
			head := renderSocialHead(t, data, tc.kind)
			for _, want := range []string{
				`<title>` + data.Title + `</title>`,
				`property="og:title" content="` + data.SocialTitle + `"`,
				`name="twitter:title" content="` + data.SocialTitle + `"`,
				`property="og:image" content="` + data.Image + `"`,
				`name="twitter:image" content="` + data.Image + `"`,
				`property="og:image:width" content="1200"`,
				`property="og:image:height" content="630"`,
				`property="og:image:type" content="image/png"`,
			} {
				if !strings.Contains(head, want) {
					t.Errorf("head missing %s", want)
				}
			}
		})
	}
}

func TestSocialHeadDoesNotGiveHomeAvatarCardDimensions(t *testing.T) {
	data := seo.BuildForHome(seo.BuilderArgs{Config: socialConfig(), Lang: "zh_CN", Title: "首页", Image: "https://example.com/avatar.jpg"})
	head := renderSocialHead(t, data, "home")
	if !strings.Contains(head, `property="og:title" content="首页"`) || !strings.Contains(head, `name="twitter:title" content="首页"`) {
		t.Fatal("home must retain its existing title")
	}
	for _, property := range []string{"og:image:width", "og:image:height", "og:image:type"} {
		if strings.Contains(head, property) {
			t.Errorf("home avatar should not get generated card metadata %s", property)
		}
	}
}
