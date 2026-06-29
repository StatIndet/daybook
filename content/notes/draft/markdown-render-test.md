---
title: Markdown 渲染测试
date: 2026-05-28
slug: markdown-render-test
tags:
  - Markdown
  - Test
summary: 用于测试博客的标准 Markdown 和 GFM 渲染效果。
draft: true
---

# 文档一级标题

这篇文章用于检查 daybook 对标准 Markdown 和 GitHub Flavored Markdown 的渲染效果。它包含段落、列表、表格、代码块、图片、脚注和标题锚点。

## 中文标题锚点测试

这是一个中文标题，用于确认标题自动生成 `id` 后，目录链接可以跳转到对应位置。

这里有 **加粗文本**、*斜体文本*、~~删除线文本~~，以及一段行内代码：`go run ./cmd/daybook build`。

### 无序列表与嵌套列表

- 第一项
- 第二项
  - 嵌套项目 A
  - 嵌套项目 B
- 第三项

### 有序列表

1. 读取 Markdown 文件。
2. 解析 frontmatter。
3. 渲染 HTML 页面。

### 任务列表

- [x] 支持 GFM 表格
- [x] 支持任务列表
- [ ] 后续再实现 Obsidian 双链

## English Heading Anchor Test

This heading checks whether English headings also receive stable IDs.

> 引用块用于展示一段被强调的说明。它应该有清晰的左边界，并在浅色和暗色主题下都保持可读。

## 表格

| 功能   | 渲染效果         | 状态  |     |
| ---- | ------------ | --- | --- |
| 加粗   | **text**     | 已测试 |     |
| 删除线  | ~~text~~     | 已测试 |     |
| 任务列表 | `- [x] item` | 已测试 |     |

## Go 代码块

```go
package main

import "fmt"

func main() {
	fmt.Println("hello daybook")
}
```

## Bash 代码块

```bash
#!/usr/bin/env bash

set -euo pipefail
go test ./...
go run ./cmd/daybook build
```

## HTML 代码块

```html
<article class="note">
  <h1>Markdown Render Test</h1>
  <p>Code blocks should be highlighted at build time.</p>
</article>
```

## 链接与图片

这是一个普通链接：[daybook](https://daybook.page)。

这是一张本地图片：

![史帙头像](/images/avatar/shelby.jpg)

---

## 脚注

脚注引用会出现在正文中。[^markdown-note]

[^markdown-note]: 这是一条脚注内容，用来测试 footnote 渲染。
