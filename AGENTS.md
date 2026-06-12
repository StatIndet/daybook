# AGENTS.md

## 项目概述

本项目名为 `daybook`，是一个使用 Go 编写的极简静态博客与 Obsidian 笔记发布工具。

项目目标是将 `content/notes/` 目录中的 Markdown 笔记转换成 `public/` 目录中的静态网站。

这个网站刻意保持简单。它没有后端、没有数据库、没有登录系统、没有评论、没有访问统计，也没有后台管理界面。

最终网站将部署到 Cloudflare Pages，并绑定自定义域名：

```text
https://daybook.page
```

## 用户背景

项目所有者是 Go 和 HTML 的初学者。

在修改代码时，优先选择简单、可读、适合初学者理解的实现方式，而不是聪明但复杂的抽象。

在新增或修改代码时，可以在必要位置加入简短注释，解释重要思路；但不要给显而易见的代码添加过多注释。

## 核心需求

最终网站将逐步支持：

* 首页
* 笔记 / 文章页
* 归档页
* 关系图谱页
* 关于页
* Obsidian 风格双链，例如 `[[笔记标题]]`
* 反向链接
* 根据笔记链接生成关系图谱数据文件
* 静态部署到 Cloudflare Pages

但是，这些功能必须一步一步实现。

不要一次性实现所有功能。

## MVP 范围

第一版可运行版本只需要实现：

1. 从 `content/notes/` 读取 Markdown 文件
2. 解析 YAML frontmatter
3. 将 Markdown 正文转换成 HTML
4. 为每篇笔记生成一个 HTML 页面
5. 生成一个简单首页，列出所有笔记
6. 将 `static/` 中的文件复制到 `public/`
7. 提供一个本地预览服务器命令

在第一版中，除非明确要求，否则不要实现标签、归档、双链、反链、关系图谱、RSS、sitemap、搜索或 CSS 美化。

## 推荐项目结构

使用以下结构：

```text
daybook/
├── cmd/
│   └── daybook/
│       └── main.go
├── internal/
│   ├── config/
│   ├── content/
│   ├── markdown/
│   ├── render/
│   └── site/
├── content/
│   └── notes/
├── templates/
│   ├── base.html
│   ├── index.html
│   └── note.html
├── static/
│   ├── css/
│   └── js/
├── public/
├── config.yaml
├── go.mod
├── go.sum
├── README.md
└── AGENTS.md
```

## Go 代码风格

* 尽可能使用 Go 标准库。
* 保持 package 小而专注。
* 使用清晰的命名。
* 返回错误，而不是直接 panic。
* 包装错误时使用 `fmt.Errorf("上下文: %w", err)`。
* 修改 Go 文件后运行 `gofmt`。
* 除非有明确理由，否则避免使用全局可变状态。
* 早期版本中避免不必要的 interface。
* 优先使用简单的 struct 和 function。

## HTML 与模板风格

* 使用 Go 的 `html/template`。
* 保持模板简单、清晰、可读。
* 不要引入前端框架。
* 不要引入 Tailwind、React、Vue、Svelte、Astro 或任何打包工具。
* CSS 使用普通 CSS，放在 `static/css/`。
* JavaScript 使用原生 JavaScript，放在 `static/js/`。
* 中英文字体使用 `static/fonts/maple/` 中的 Maple 字体。
* 图标优先使用 `static/fonts/material-symbols/` 中的 Material Symbols。
* 社交平台等图片图标可以使用 `static/images/` 中的 SVG 文件。

## Markdown 与 Frontmatter

Markdown 笔记格式如下：

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

在 MVP 阶段，必填字段是：

* `title`
* `date`
* `slug`

可选字段是：

* `tags`
* `summary`
* `draft`

如果 `draft: true`，这篇笔记不应该被发布。

## 命令

CLI 最终应支持：

```bash
go run ./cmd/daybook build
go run ./cmd/daybook serve
```

当前阶段：

* `build` 负责生成 `public/`
* `serve` 负责在 `http://localhost:1313` 预览 `public/`

## 构建输出

生成的文件应使用干净 URL：

```text
public/
├── index.html
└── notes/
    └── example-note/
        └── index.html
```

一篇 `slug: "example-note"` 的笔记应能通过以下地址访问：

```text
/notes/example-note/
```

## 测试与验证

修改代码后，运行：

```bash
go test ./...
go run ./cmd/daybook build
```

如果修改了本地服务器相关代码，需要验证：

```bash
go run ./cmd/daybook serve
```

能够正常服务生成后的 `public/` 目录。

## 开发流程

小步推进。

在进行较大修改前，先提出一个简短计划。

每完成一步，说明：

* 修改了什么
* 改动了哪些文件
* 如何测试
* 下一步建议做什么

除非明确要求，否则不要重写整个项目。

不要在没有解释原因的情况下添加大型依赖。

不要删除 `content/notes/` 中的用户内容。

除非明确要求，否则不要将生成的 `public/` 文件提交到 git。

## 未来功能

MVP 可运行之后，按以下顺序实现后续功能：

1. 归档页
2. 关于页
3. Obsidian 双链
4. 反向链接
5. 关系图谱 JSON 生成
6. 关系图谱页面渲染
7. 附件支持
8. RSS 和 sitemap

每个未来功能都应该作为单独步骤实现。

## Protected Layout

The persistent logo and side navigation are now stable.

Do not modify the following unless explicitly requested:

- `.persistent-logo`
- side navigation layout
- side navigation avatar position
- side navigation link order
- persistent logo position
- persistent logo typography

The persistent logo must stay fixed across all pages and must not participate in page transition animations.
