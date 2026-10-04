package site

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/og"
	"golang.org/x/net/html"
)

func writeOGTestImage(t *testing.T, vault, name string) {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, 240, 160))
	for y := 0; y < 160; y++ {
		for x := 0; x < 240; x++ {
			picture.Set(x, y, color.RGBA{uint8(x), uint8(y), 180, 255})
		}
	}
	var data bytes.Buffer
	if err := png.Encode(&data, picture); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, vault, name, data.String())
}

func headMeta(t *testing.T, document string) map[string]string {
	t.Helper()
	meta := make(map[string]string)
	z := html.NewTokenizer(strings.NewReader(document))
	for z.Next() != html.ErrorToken {
		token := z.Token()
		if token.Type == html.EndTagToken && token.Data == "head" {
			break
		}
		if token.Data != "meta" {
			continue
		}
		var key, value string
		for _, attr := range token.Attr {
			switch attr.Key {
			case "name", "property":
				key = attr.Val
			case "content":
				value = attr.Val
			}
		}
		meta[key] = value
	}
	return meta
}

func TestBuildStaticOpenGraph(t *testing.T) {
	vault := t.TempDir()
	publicDir := filepath.Join(t.TempDir(), "public")
	writeTestFile(t, vault, "pages/about.md", "---\ntitle: About\n---\nAbout.")
	writeTestFile(t, vault, "notes/中文 笔记.md", "---\ndate: 2026-10-04\ntags: [生活, Go, 随笔, 更多]\n---\n## 正文\n没有 summary 的**中文笔记**，包含 [链接](https://example.com)。")
	writeTestFile(t, vault, "notes/english.md", "---\ndate: 2026-10-04\nlang: en_US\nsummary: A **short** <em>summary</em>.\nupdated: 2026-10-05\n---\nBody should not replace the supplied summary.")
	writeTestFile(t, vault, "memos/不应显示为标题.md", "---\ndate: 2026-10-04T22:30:00+08:00\nsummary: This summary must not replace the memo body.\n---\n这是一条**没有图片**的短记。")
	writeOGTestImage(t, vault, "attachments/窗 边.png")
	for count := 1; count <= 5; count++ {
		body := "有图片的中文帖子。 " + strings.Repeat("Long memo content，保持正文可读。 ", 35)
		for i := 0; i < count; i++ {
			body += "\n\n![[窗 边.png]]"
		}
		name := string(rune('0' + count))
		writeTestFile(t, vault, "memos/photos-"+name+".md", "---\ndate: 2026-10-04\ntags: [摄影]\n---\n"+body)
	}
	writeTestFile(t, vault, "memos/draft.md", "---\ndraft: true\n---\nPrivate.")
	writeTestFile(t, vault, "notes/invalid.md", "---\ndate: invalid\n---\nInvalid.")
	cfg := config.Config{
		Site: config.SiteConfig{URL: "https://blog.example/"},
		Profile: config.ProfileConfig{Author: config.AuthorConfig{
			Name: "史帙", NameEn: "Shizhi", Avatar: "/attachments/窗%20边.png", LogoText: "Daybook",
		}},
	}
	result, err := Build(Options{Config: cfg, ContentDir: vault, NotesDir: filepath.Join(vault, "notes"), PublicDir: publicDir})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Notes) != 2 || len(result.Memos) != 6 || len(result.Skipped) != 1 {
		t.Fatalf("unexpected published entries: %+v", result)
	}
	for _, note := range append(result.Notes, result.Memos...) {
		relative := og.ImagePath(note.Section, note.URL)
		if !strings.HasPrefix(relative, "/generated/og/"+note.Section+"/") {
			t.Fatalf("unexpected image path: %s", relative)
		}
		data, err := os.ReadFile(filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(relative, "/"))))
		if err != nil {
			t.Fatal(err)
		}
		picture, err := png.Decode(bytes.NewReader(data))
		if err != nil || picture.Bounds().Dx() != 1200 || picture.Bounds().Dy() != 630 {
			t.Fatalf("invalid 1200x630 PNG for %s: %v", note.URL, err)
		}
		page := readPublicAsset(t, publicDir, note.URL+"index.html")
		meta := headMeta(t, page)
		wantURL := "https://blog.example" + relative
		if meta["og:image"] != wantURL || meta["twitter:image"] != wantURL {
			t.Errorf("%s image metadata: %+v", note.URL, meta)
		}
		if meta["og:image:width"] != "1200" || meta["og:image:height"] != "630" || meta["og:image:type"] != "image/png" {
			t.Errorf("%s image dimensions are missing", note.URL)
		}
		if note.Section == "memos" && meta["og:title"] != "史帙 · 2026-10-04" {
			t.Errorf("memo must use its author/date as social title: %s", meta["og:title"])
		}
	}
	for section, count := range map[string]int{"notes": 2, "memos": 6} {
		files, err := filepath.Glob(filepath.Join(publicDir, "generated", "og", section, "*.png"))
		if err != nil || len(files) != count {
			t.Errorf("%s generated %d images, want %d: %v", section, len(files), count, err)
		}
	}
	plain := headMeta(t, readPublicAsset(t, publicDir, "/notes/中文 笔记/index.html"))["og:description"]
	if !strings.Contains(plain, "没有 summary 的中文笔记") || strings.ContainsAny(plain, "*<>#") {
		t.Errorf("body excerpt is not clean text: %s", plain)
	}
	summary := headMeta(t, readPublicAsset(t, publicDir, "/en_US/notes/english/index.html"))["og:description"]
	if summary != "A short summary." {
		t.Errorf("summary priority/cleanup failed: %s", summary)
	}
	plainMemo := headMeta(t, readPublicAsset(t, publicDir, "/memos/不应显示为标题/index.html"))["og:description"]
	if plainMemo != "这是一条没有图片的短记。" {
		t.Errorf("memo description must come from its body: %s", plainMemo)
	}
}
