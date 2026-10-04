package og

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/rivo/uniseg"
	"golang.org/x/net/html"
)

func testConfig() config.Config {
	return config.Config{Profile: config.ProfileConfig{Author: config.AuthorConfig{
		Name: "史帙", NameEn: "Stat Indet", LogoText: "Daybook", Avatar: "/attachments/窗%20边.png",
	}}}
}

func TestNoteCardSummaryAndStaticMetadata(t *testing.T) {
	note := content.Note{
		Title: "中文标题 <静态>", Section: "notes", URL: "/notes/中文标题/", Lang: "zh_CN",
		Summary: "A **short** <em>summary</em>. ~~Revised~~.", Date: "2026-10-04", Updated: "2026-10-05", ReadingMinutes: 3,
	}
	card, err := NewCard(note, "<p>Body fallback.</p>", testConfig(), []string{"Go", "中文", "HTML", "excluded"})
	if err != nil {
		t.Fatal(err)
	}
	if card.Description != "A short summary. Revised." {
		t.Fatalf("description = %q", card.Description)
	}
	for _, expected := range []string{"中文标题 &lt;静态&gt;", "3 min read", "2026-10-04", "Updated 2026-10-05", "#Go", "#中文", "#HTML"} {
		if !strings.Contains(card.HTML, expected) {
			t.Errorf("card missing %q", expected)
		}
	}
	for _, excluded := range []string{"excluded", "Body fallback", "<em>", "<script", "/css/", "分钟阅读", "更新于"} {
		if strings.Contains(card.HTML, excluded) {
			t.Errorf("card unexpectedly contains %q", excluded)
		}
	}
	if card.PageURL != (&url.URL{Path: note.URL}).EscapedPath() || card.OutputPath != ImagePath("notes", note.URL) {
		t.Fatalf("unexpected routing: %+v", card)
	}
}

func TestNoteCardFallsBackToCleanBody(t *testing.T) {
	note := content.Note{Title: "Without summary", URL: "/notes/fallback/", Lang: "en_US"}
	body := `<h2>中文 <em>and English</em></h2><p>One &amp; two.</p><div class="highlight"><button>Copy</button><pre><code>fmt.Println()</code></pre></div><script>doNotShow()</script><style>.ignored{}</style><svg><text>icon</text></svg><span aria-hidden="true">Hidden</span>`
	card, err := NewCard(note, body, testConfig(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if card.Description != "中文 and English One & two. fmt.Println()" {
		t.Fatalf("description = %q", card.Description)
	}
	if strings.Contains(card.HTML, `<span class="updated">`) || strings.Contains(card.HTML, `<div class="tags">`) {
		t.Fatal("empty update and tags should not render")
	}
	if !strings.Contains(card.HTML, "1 min read") {
		t.Fatal("missing reading time")
	}
}

func TestNoteCardBrandAndEnglishMetadataInBothLanguages(t *testing.T) {
	for _, lang := range []string{"zh_CN", "en_US"} {
		for _, avatar := range []string{"/attachments/avatar.png", ""} {
			t.Run(lang+"/"+avatar, func(t *testing.T) {
				cfg := testConfig()
				cfg.Profile.Author.Avatar = avatar
				card, err := NewCard(content.Note{Lang: lang, Date: "2026-06-25", Updated: "2026-08-23"}, "<p>摘要 Summary.</p>", cfg, nil)
				if err != nil {
					t.Fatal(err)
				}
				root, err := html.Parse(strings.NewReader(card.HTML))
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(card.HTML, ">1 min read</span>") || classText(root, "updated") != "Updated 2026-08-23" {
					t.Fatal("OG reading time and update label must remain English in both languages")
				}
				if classText(root, "site-name") != cfg.GetSiteName(lang) {
					t.Fatal("brand must retain the configured site name")
				}
				if avatar != "" {
					if !strings.Contains(card.HTML, `<img class="brand-avatar" src="`+avatar+`"`) || strings.Contains(card.HTML, `<span class="brand-avatar brand-avatar-fallback">`) {
						t.Fatal("note brand must use the existing author avatar")
					}
				} else {
					initial := "史"
					if lang == "en_US" {
						initial = "S"
					}
					if classText(root, "brand-avatar brand-avatar-fallback") != initial || strings.Contains(card.HTML, `<img class="brand-avatar"`) {
						t.Fatal("note brand must fall back to the existing localized author initial")
					}
				}
			})
		}
	}
}

func TestCardsReferenceRealMetadataItalicFace(t *testing.T) {
	for _, section := range []string{"notes", "memos"} {
		card, err := NewCard(content.Note{Section: section, Date: "2026-10-04"}, "<p>Content.</p>", testConfig(), nil)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(card.HTML, `/vendor/fonts/cormorant-garamond/cormorant-garamond-latin-600-italic.woff2`) || !strings.Contains(card.HTML, `font-family: "Cormorant Garamond Meta"`) || !strings.Contains(card.HTML, `font-synthesis: none`) {
			t.Errorf("%s must load the real metadata italic face without synthesis", section)
		}
	}
}

func TestMemoCardShowsPostBodyAndImageOverflow(t *testing.T) {
	note := content.Note{
		Title: "filename-must-not-be-heading", Section: "memos", URL: "/en_US/memos/中文/", Lang: "en_US",
		Date: "2026-10-04", Summary: "Ignored article summary",
	}
	body := `<p>A <strong>memo</strong>, directly from the post.</p><div class="md-gallery">`
	for i := 0; i < 6; i++ {
		body += `<figure><img src="../attachments/窗%20边.png" alt="window"></figure>`
	}
	body += `</div><button>Share</button><div class="memo-actions">Likes Views Comments RSS</div>`
	card, err := NewCard(note, body, testConfig(), []string{"随记"})
	if err != nil {
		t.Fatal(err)
	}
	if card.Description != "A memo, directly from the post." {
		t.Fatalf("description = %q", card.Description)
	}
	decodedHTML := regexp.MustCompile(`src="[^"]*"`).ReplaceAllStringFunc(card.HTML, func(source string) string {
		decoded, err := url.PathUnescape(source)
		if err != nil {
			t.Fatal(err)
		}
		return decoded
	})
	for _, expected := range []string{`class="images images-4"`, `class="more">+2`, "Stat Indet", "/attachments/窗 边.png", "../attachments/窗 边.png", "#随记"} {
		if !strings.Contains(decodedHTML, expected) {
			t.Errorf("memo missing %q", expected)
		}
	}
	for _, excluded := range []string{note.Title, note.Summary, "<h1", "Likes", "Views", "Comments", "RSS", "Share"} {
		if strings.Contains(card.HTML, excluded) {
			t.Errorf("memo unexpectedly contains %q", excluded)
		}
	}
	if got := strings.Count(card.HTML, `<figure class="image">`); got != 4 {
		t.Fatalf("image cells = %d, want 4", got)
	}
}

func TestMemoImageLayoutsAndEmptyAvatar(t *testing.T) {
	for count := 0; count <= 4; count++ {
		t.Run(fmt.Sprintf("%d pictures", count), func(t *testing.T) {
			cfg := testConfig()
			cfg.Profile.Author.Avatar = ""
			body := "<p>没有摘要的帖子。</p>" + strings.Repeat(`<img src="/attachments/photo.png">`, count)
			card, err := NewCard(content.Note{Section: "memos", URL: "/memos/随记/"}, body, cfg, nil)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(card.HTML, `<span class="avatar">史</span>`) {
				t.Error("empty avatar should use author's first grapheme")
			}
			if count == 0 && strings.Contains(card.HTML, `<div class="images`) {
				t.Error("text-only memo should not reserve an image grid")
			}
			if count > 0 && !strings.Contains(card.HTML, fmt.Sprintf(`class="images images-%d"`, count)) {
				t.Errorf("missing %d-image layout", count)
			}
		})
	}
}

func TestLongCardTextIsBoundedWithoutBreakingGraphemes(t *testing.T) {
	longText := strings.Repeat("中文e\u0301👩‍💻", 180)
	for _, section := range []string{"notes", "memos"} {
		t.Run(section, func(t *testing.T) {
			card, err := NewCard(content.Note{Title: longText, Summary: longText, Section: section, URL: "/" + section + "/long/"}, "<p>"+longText+"</p>", testConfig(), []string{longText})
			if err != nil {
				t.Fatal(err)
			}
			if !utf8.ValidString(card.HTML) || !strings.HasSuffix(card.Description, "…") || uniseg.GraphemeClusterCount(card.Description) != 241 {
				t.Fatalf("invalid or unbounded description: %q", card.Description)
			}
			root, err := html.Parse(strings.NewReader(card.HTML))
			if err != nil {
				t.Fatal(err)
			}
			class := "summary"
			limit := 281
			if section == "memos" {
				class, limit = "body", 361
			}
			text := classText(root, class)
			if uniseg.GraphemeClusterCount(text) != limit || !strings.HasSuffix(text, "…") {
				t.Fatalf("%s not bounded: %d graphemes", class, uniseg.GraphemeClusterCount(text))
			}
		})
	}
	if got := truncateText("Ae\u0301👩‍💻中B", 3); got != "Ae\u0301👩‍💻…" {
		t.Fatalf("grapheme truncation = %q", got)
	}
}

func TestImagePathsAreStableSafeAndUnique(t *testing.T) {
	paths := map[string]bool{}
	for _, route := range []string{"/notes/中文/", "/en_US/notes/中文/", "/memos/中文/", "/notes/a?b#c/", "/notes/a_b_c/"} {
		section := "notes"
		if strings.HasPrefix(route, "/memos/") {
			section = "memos"
		}
		got := ImagePath(section, route)
		if got != ImagePath(section, route) || !regexp.MustCompile(`^/generated/og/(notes|memos)/[a-f0-9]{32}\.png$`).MatchString(got) {
			t.Fatalf("unstable or unsafe path: %s", got)
		}
		if paths[got] {
			t.Fatalf("duplicate path %s", got)
		}
		paths[got] = true
	}
	if ImagePath("notes", "/same/") == ImagePath("memos", "/same/") {
		t.Fatal("sections must have independent paths")
	}
}

func TestNewCardURLFilenameCharacters(t *testing.T) {
	for _, filename := range []string{"C# basics", "100% done", "question?", "中文标题"} {
		t.Run(filename, func(t *testing.T) {
			note := content.Note{Section: "notes", URL: "/notes/" + filename + "/"}
			card, err := NewCard(note, "<p>A valid filename.</p>", testConfig(), nil)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateCard(card); err != nil {
				t.Fatalf("filename rejected by renderer: %v", err)
			}
			decoded, err := url.PathUnescape(card.PageURL)
			if err != nil || decoded != note.URL {
				t.Fatalf("page URL changed filename: %q (%v)", decoded, err)
			}
			if card.OutputPath != ImagePath(note.Section, note.URL) {
				t.Fatal("page URL escaping should not change stable output hash")
			}
		})
	}
}

func TestExtractContentOmitsUnsafeImagesAndInteractiveText(t *testing.T) {
	body, images, err := extractContent(`<p>Visible <a href="https://example.com">link</a>.</p><img src=""><img src="javascript:alert(1)"><img src="file:///etc/passwd"><img src="/photo.png" alt="&quot;&gt;"><span class="memo-more-photos">+99 View photos</span><iframe>External embed</iframe><div hidden>Hidden text</div><pre class="mermaid">graph TD; A-->B</pre>`)
	if err != nil {
		t.Fatal(err)
	}
	if body != "Visible link." || len(images) != 1 || images[0].Source != "/photo.png" {
		t.Fatalf("unexpected extraction: %q %+v", body, images)
	}
}

func TestCardDatesUseCalendarDate(t *testing.T) {
	note := content.Note{Date: "2026-10-04T20:30:00+08:00", Updated: "2026-10-05T10:00:00+08:00"}
	card, err := NewCard(note, "<p>Post.</p>", testConfig(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(card.HTML, "2026-10-04") || !strings.Contains(card.HTML, "2026-10-05") || strings.Contains(card.HTML, "20:30") || strings.Contains(card.HTML, "10:00") {
		t.Fatal("card metadata should use calendar dates")
	}
	if got := displayDate("invalid"); got != "" {
		t.Fatalf("invalid optional update = %q", got)
	}
}

func classText(node *html.Node, class string) string {
	if node.Type == html.ElementNode && attribute(node, "class") == class {
		var text strings.Builder
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.TextNode {
				text.WriteString(child.Data)
			}
		}
		return text.String()
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if text := classText(child, class); text != "" {
			return text
		}
	}
	return ""
}
