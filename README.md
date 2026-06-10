# Daybook

Daybook 是一个使用 Go 编写的极简静态博客生成器，用于把 `content/notes/` 中的 Markdown 笔记发布成静态网站。

当前版本只实现 MVP：读取笔记、解析 YAML frontmatter、转换 Markdown、生成静态页面，并提供本地预览服务。

## 笔记格式

笔记放在 `content/notes/` 目录中，格式如下：

```markdown
---
title: "示例笔记"
date: "2026-06-08"
slug: "example-note"
tags: ["Go", "Blog"]
summary: "一段简短摘要。"
draft: false
---

这里是笔记正文。
```

必填字段：

- `title`
- `date`
- `slug`

可选字段：

- `tags`
- `summary`
- `draft`

当 `draft: true` 时，这篇笔记不会发布。

## 构建

```bash
go run ./cmd/daybook build
```

构建结果会生成到 `public/` 目录。

## 本地预览

先构建：

```bash
go run ./cmd/daybook build
```

再启动预览服务器：

```bash
go run ./cmd/daybook serve
```

访问：

```text
http://localhost:1313
```

## 当前不包含

当前 MVP 还没有实现标签页、归档页、双链、反链、关系图谱、RSS、sitemap 和搜索。
