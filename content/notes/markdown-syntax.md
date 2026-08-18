---
title: Markdown 语法说明
date: 2026-06-28
tags:
  - Markdown
  - Obsidian
summary: 关于 Daybook 所支持的标准 Markdown 以及 Obsidian 扩展语法特性的完整参考指南。
draft: false
math: true
---

# Markdown 语法说明

这篇文章是 Daybook 对标准 Markdown、GitHub Flavored Markdown (GFM) 以及各种 Obsidian 特色扩展语法的渲染效果汇总。

## 标准 Markdown 与 GFM

### 文本格式

这里有 **加粗文本**、*斜体文本*、~~删除线文本~~，以及一段行内代码：`go run ./cmd/daybook build`。

### 列表

**无序列表与嵌套列表**：
- 第一项
- 第二项
  - 嵌套项目 A
  - 嵌套项目 B

**有序列表**：
1. 读取 Markdown 文件。
2. 解析 frontmatter。
3. 渲染 HTML 页面。

**任务列表**：
- [x] 支持 GFM 表格
- [x] 支持任务列表
- [ ] 待办事项

### 引用块

> 引用块用于展示一段被强调的说明。它应该有清晰的左边界，并在浅色和暗色主题下都保持可读。

### 表格

| 功能 | 渲染效果 | 状态 |
| --- | --- | --- |
| 加粗 | **text** | 已测试 |
| 删除线 | ~~text~~ | 已测试 |
| 任务列表 | `- [x] item` | 已测试 |

### 代码块

支持带语法高亮的代码块：

```go
package main

import "fmt"

func main() {
	fmt.Println("hello daybook")
}
```

### 脚注

脚注引用会出现在正文中。[^markdown-note]

[^markdown-note]: 这是一条脚注内容，用来测试 footnote 渲染。

---

## 本地附件系统

Daybook 完整兼容了 Obsidian 的双链附件引用语法。

### 图片嵌入与排版

你可以使用 `![[filename.jpg]]` 语法插入本地图片，并可以通过管道符 `|` 添加宽度和对齐方式参数。支持的语法格式包括：
- 默认图片：`![[shi-li.jpg]]`
- 指定宽度：`![[shi-li.jpg|200]]`
- 指定宽高：`![[shi-li.jpg|640x480]]`
- 居中/左/右对齐：`![[shi-li.jpg|center]]`、`![[shi-li.jpg|left]]`、`![[shi-li.jpg|right]]`
- 组合参数：`![[shi-li.jpg|center|300]]`

**渲染示例**：
![[shi-li.jpg|center|300]]

### 音视频与 PDF 嵌入

所有的本地 PDF, Audio, Video 都被当作普通的附件处理，自动在构建时复制：

**PDF 预览**：
语法：`![[shi-jian-lun.pdf]]`

**音频播放**：
语法：`![[JayChou.FLAC]]`

**视频播放**：
语法：`![[1130650335.mp4|center|720]]`

---

## 远程富媒体与音乐播放器

Daybook 提供了自有的 `::type` directive 语法用于加载远程媒体资源。

### 远程媒体组件

你可以使用以下语法直接挂载任何 HTTP(S) URL 媒体：

- `::image{url="https://..." align="center" width="400" caption="Image Caption"}`
- `::video{url="https://..." align="center" width="720" autoplay="true" loop="true"}`
- `::audio{url="https://..."}`
- `::pdf{url="https://..." height="800"}`

### 无缝音乐播放器

使用 `::music` 指令，Daybook 会在构建阶段按需请求远程 FLAC 文件的开头部分以提取 `STREAMINFO`, `VORBIS_COMMENT`, 和 `PICTURE`。它能自动获取歌曲的时长、歌名、歌手和封面，生成并内嵌出一个美观的音乐播放器：

```markdown
::music{url="https://example.com/audio/song.flac" loop="true"}
```

你也可以手动覆盖音乐信息：

```markdown
::music{url="https://example.com/audio/song.mp3" title="自定义标题" artist="自定义歌手" cover="https://example.com/cover.jpg"}
```

---

## Obsidian Callout (提示块)

通过 `> [!type]` 语法，可以创建各种样式的提示块。

**基础类型**：
> [!note]
> 这是一个普通 Note callout。

> [!tip]
> 这是一个 Tip callout。

> [!important]
> 这是一个 Important callout。

> [!warning]
> 这是一个 Warning callout。

> [!caution]
> 这是一个 Caution callout。

**自定义标题与折叠**：
可以通过 `+` 或 `-` 控制默认展开/折叠状态，并在括号后追加自定义标题。

> [!faq]- 点击展开查看答案
> 这段内容默认是折叠的。
> 可以包含 **加粗** 或 `代码`。

**嵌套 Callout**：
> [!question] 外层 Callout
> 这是外层内容。
> > [!todo] 内层 Callout
> > 这是嵌套在内部的 Callout 块。

---

## Obsidian 注释与高亮

**高亮文本**：
使用 `==` 将文本包裹，可以渲染出原生的 ==高亮文本==。

**注释语法**：
使用 `%%` 包裹的内容将被作为 Obsidian 专属注释处理，在最终构建的 HTML 页面中完全不可见，不会被发布。
`%% 这是一段不会被发布的注释 %%`

*（注意：代码块、行内代码、数学公式中的双等号和百分号会被安全保留，不会被误解析）*

---

## Obsidian 页面与块级嵌入

你可以将其他 Markdown 笔记的内容嵌入到当前文章中。

**页面整体嵌入**：
语法：`![[english test]]`
![[thoughts-in-a-quiet-night]]

**小节标题嵌入**：
语法：`![[obsidian-embed-test#可被标题嵌入的小节]]`

**块级 (Block ID)嵌入**：
语法：`![[obsidian-embed-test#^embed-test-block]]`
