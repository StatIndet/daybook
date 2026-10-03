package obsidian

import (
	"strings"
	"testing"
)

func TestProcessWikilinks(t *testing.T) {
	index := NewIndex([]Target{
		{
			Title:      "在n150小主机上安装Debian并配置为SSH Server",
			Slug:       "debian-ssh-server",
			SourcePath: "content/notes/安装 Debian SSH Server.md",
			Headings: map[string]string{
				"自动关机脚本": "自动关机脚本",
			},
		},
	}, nil, "", "attachments", "shortest")

	result := Process("[[安装 Debian SSH Server]]\n[[安装 Debian SSH Server#自动关机脚本|关机脚本]]\n[[不存在]]", index, "", 1)

	wantParts := []string{
		"[在n150小主机上安装Debian并配置为SSH Server](/notes/debian-ssh-server/)",
		"[关机脚本](/notes/debian-ssh-server/#%E8%87%AA%E5%8A%A8%E5%85%B3%E6%9C%BA%E8%84%9A%E6%9C%AC)",
		`<a class="wiki-link is-unresolved" href="#">不存在</a>`,
	}
	for _, part := range wantParts {
		if !strings.Contains(result.Text, part) {
			t.Fatalf("processed text does not contain %q: %s", part, result.Text)
		}
	}

	if len(result.Links) != 3 {
		t.Fatalf("expected 3 links, got %d", len(result.Links))
	}
	if result.Links[0].Target != "安装 Debian SSH Server" || !result.Links[0].Exists {
		t.Fatalf("first link unexpected: %+v", result.Links[0])
	}
	if result.Links[1].Alias != "关机脚本" || !result.Links[1].Exists {
		t.Fatalf("second link unexpected: %+v", result.Links[1])
	}
	if result.Links[2].Target != "不存在" || result.Links[2].Exists {
		t.Fatalf("third link unexpected: %+v", result.Links[2])
	}
}

func TestProcessCrossSectionWikilinksUsesCanonicalURLs(t *testing.T) {
	index := NewIndex([]Target{
		{Title: "foo", Slug: "foo", Section: "notes", URL: "/notes/foo/", SourcePath: "/vault/notes/foo.md"},
		{Title: "foo", Slug: "foo", Section: "memos", URL: "/en_US/memos/foo/", SourcePath: "/vault/memos/foo.md", Content: "Memo body", Headings: map[string]string{"detail": "detail"}},
	}, nil, "/", "attachments", "shortest")
	result := Process("[[notes/foo]] [[memos/foo#Detail|memo]] ![[memos/foo]]", index, "/vault/notes/source.md", 1)
	for _, want := range []string{"[foo](/notes/foo/)", "[memo](/en_US/memos/foo/#detail)"} {
		if !strings.Contains(result.Text, want) {
			t.Fatalf("missing %q in %s", want, result.Text)
		}
	}
	if len(result.Links) != 3 || result.Links[1].URL != "/en_US/memos/foo/" || result.Links[1].Section != "memos" {
		t.Fatalf("cross-section links = %+v", result.Links)
	}
	if html := RestoreHTML(result.Text, result.HTML); !strings.Contains(html, `href="/en_US/memos/foo/"`) || !strings.Contains(html, "Memo body") {
		t.Fatalf("memo embed lost its target URL or content: %s", html)
	}
}

func TestAttachmentsResolveFromAbsoluteSourcePaths(t *testing.T) {
	attachments := []Attachment{
		{Name: "photo.png", RelPath: "notes/assets/photo.png", AbsPath: "/vault/notes/assets/photo.png", PublicURL: "/notes/assets/photo.png", MediaType: "image"},
		{Name: "photo.png", RelPath: "memos/assets/photo.png", AbsPath: "/vault/memos/assets/photo.png", PublicURL: "/memos/assets/photo.png", MediaType: "image"},
	}
	index := NewIndex(nil, attachments, "/", "./assets", "relative")
	result := Process("![memo](./assets/photo.png)\n\n![[../notes/assets/photo.png]]", index, "/vault/memos/walk.md", 1)
	if len(result.Diagnostics) != 0 || len(result.Attachments) != 2 {
		t.Fatalf("relative attachments failed: %+v", result)
	}
	if !strings.Contains(result.Text, "![memo](/memos/assets/photo.png)") {
		t.Fatalf("memo attachment resolved to the wrong section: %s", result.Text)
	}
	if html := RestoreHTML(result.Text, result.HTML); !strings.Contains(html, `src="/notes/assets/photo.png"`) {
		t.Fatalf("cross-section attachment embed failed: %s", html)
	}
	if att, ok, candidates := index.ResolveAttachment("photo.png", "/vault/memos/walk.md"); !ok || att.PublicURL != "/memos/assets/photo.png" || len(candidates) != 0 {
		t.Fatalf("relative attachmentFolderPath failed: %+v, %v, %v", att, ok, candidates)
	}
}

func TestProcessImages(t *testing.T) {
	input := `![添加新连接](./assets/add-new-link.png)

<p align="center">
  <img src="./assets/br0.png" width="500" alt="网桥">
</p>

<script>alert(1)</script>`
	result := Process(input, NewIndex(nil, nil, "", "attachments", "shortest"), "", 1)
	html := RestoreHTML("<p>DAYBOOK_HTML_IMAGE_0</p>", result.HTML)

	if !strings.Contains(result.Text, `![添加新连接](/notes/assets/add-new-link.png)`) {
		t.Fatalf("markdown image path was not rewritten: %s", result.Text)
	}
	if !strings.Contains(html, `<p class="markdown-image markdown-image-center"><img src="/notes/assets/br0.png" alt="网桥" width="500"></p>`) {
		t.Fatalf("safe image HTML was not restored: %s", html)
	}
	if !strings.Contains(result.Text, "<script>alert(1)</script>") {
		t.Fatalf("unrelated HTML should be left for markdown escaping, got: %s", result.Text)
	}
}

func TestResolveAttachment(t *testing.T) {
	attachments := []Attachment{
		{Name: "photo.png", RelPath: "photo.png"},
		{Name: "a.jpg", RelPath: "attachments/picture/a.jpg"},
		{Name: "image.png", RelPath: "notes/foo/image.png"},
		{Name: "image.png", RelPath: "notes/b/image.png"},
		{Name: "image.png", RelPath: "notes/a/image.png"}, // Ambiguous name!
		{Name: "foo.pdf", RelPath: "media/foo.pdf"},
	}

	tests := []struct {
		name                 string
		target               string
		sourcePath           string
		attachmentFolderPath string
		expectedPath         string
	}{
		{
			name:                 "app.json missing/empty -> Vault root",
			target:               "photo.png",
			sourcePath:           "notes/article.md",
			attachmentFolderPath: "",
			expectedPath:         "photo.png",
		},
		{
			name:                 "Fixed attachment directory",
			target:               "picture/a.jpg",
			sourcePath:           "notes/article.md",
			attachmentFolderPath: "attachments",
			expectedPath:         "attachments/picture/a.jpg",
		},
		{
			name:                 "Same folder as current file",
			target:               "image.png",
			sourcePath:           "notes/foo/article.md",
			attachmentFolderPath: "./",
			expectedPath:         "notes/foo/image.png",
		},
		{
			name:                 "Explicit vault path preferred",
			target:               "media/foo.pdf",
			sourcePath:           "notes/article.md",
			attachmentFolderPath: "attachments",
			expectedPath:         "media/foo.pdf",
		},
		{
			name:                 "Embedded note context",
			target:               "image.png",
			sourcePath:           "notes/b/embedded.md",
			attachmentFolderPath: "./",
			expectedPath:         "notes/b/image.png",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idx := NewIndex(nil, attachments, "/", tc.attachmentFolderPath, "shortest")
			att, ok, _ := idx.ResolveAttachment(tc.target, tc.sourcePath)
			if !ok {
				t.Fatalf("Failed to resolve %q", tc.target)
			}
			if att.RelPath != tc.expectedPath {
				t.Errorf("Expected %q, got %q", tc.expectedPath, att.RelPath)
			}
		})
	}

	// Test ambiguity
	t.Run("duplicate basename", func(t *testing.T) {
		idx := NewIndex(nil, attachments, "/", "./", "shortest")
		_, ok, _ := idx.ResolveAttachment("image.png", "other/article.md") // no context match, fallback to basename
		if ok {
			t.Errorf("Expected failure due to ambiguous basename, got success")
		}
	})
}
