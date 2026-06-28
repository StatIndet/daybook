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
	}, nil, nil, "")

	result := Process("[[安装 Debian SSH Server]]\n[[安装 Debian SSH Server#自动关机脚本|关机脚本]]\n[[不存在]]", index)

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

func TestProcessImages(t *testing.T) {
	input := `![添加新连接](./assets/add-new-link.png)

<p align="center">
  <img src="./assets/br0.png" width="500" alt="网桥">
</p>

<script>alert(1)</script>`

	result := Process(input, NewIndex(nil, nil, nil, ""))
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
