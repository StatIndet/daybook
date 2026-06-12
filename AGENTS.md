# AGENTS.md

## 项目概述

`daybook` 是一个使用 Go 编写的极简静态博客与 Obsidian 笔记发布工具。

项目目标是将 `content/notes/` 目录中的 Markdown 笔记转换成 `public/` 目录中的静态网站。当前已经完成基础页面结构、文章列表、文章详情、persistent logo、side-nav、明暗主题和基础 Markdown 渲染。

这个网站刻意保持简单。它没有后端、没有数据库、没有登录系统、没有评论、没有访问统计，也没有后台管理界面。

最终网站将部署到 Cloudflare Pages，并绑定自定义域名：

```text
https://daybook.page
```

## 用户背景

项目所有者是 Go 和 HTML 的初学者。

修改代码时，优先选择简单、可读、适合初学者理解的实现方式，而不是聪明但复杂的抽象。必要时可以加入简短注释解释关键思路，但不要给显而易见的代码添加过多注释。

## 当前已完成能力

* 首页 hero；
* 文章列表页 `/notes/`；
* 文章详情页 `/notes/{slug}/`；
* Markdown frontmatter；
* Markdown / GFM 渲染基础；
* persistent logo；
* side-nav；
* 明暗主题；
* 页面切换动画；
* `static/` 资源复制；
* 本地 `build` / `serve` 命令。

## 已完成的 MVP

MVP 已完成，项目现在进入功能增强阶段。

已完成的 MVP 能力包括：

1. 从 `content/notes/` 读取 Markdown 文件；
2. 解析 YAML frontmatter；
3. 将 Markdown 正文转换成 HTML；
4. 为每篇笔记生成一个 HTML 页面；
5. 生成首页和文章列表页；
6. 将 `static/` 中的文件复制到 `public/`；
7. 提供本地预览服务器命令。

后续功能必须一步一步实现。不要一次性实现多个未来功能。

## 当前项目结构

```text
daybook/
├── cmd/
│   └── daybook/
├── internal/
│   ├── config/
│   ├── content/
│   ├── markdown/
│   ├── render/
│   └── site/
├── content/
│   └── notes/
├── templates/
├── static/
│   ├── css/
│   ├── js/
│   ├── fonts/
│   └── images/
├── public/
├── config.yaml
├── go.mod
├── go.sum
├── README.md
└── AGENTS.md
```

`public/` 是构建产物。默认不要手动编辑 `public/`，也不要提交 `public/`，除非用户明确要求。

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

## Protected Layout

The persistent logo and side navigation are stable.

除非用户明确要求，不要修改：

* `.persistent-logo` 的位置、字体、字号、结构；
* side-nav 的位置、头像、链接顺序；
* side navigation layout；
* side navigation avatar position；
* side navigation link order；
* persistent logo typography。

`.persistent-logo` 必须在所有页面固定显示，并且不参与页面切换动画。修改页面切换动画、文章页布局或全局 CSS 时，必须确认 persistent logo 和 side-nav 没有被影响。

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

必填字段：

* `title`
* `date`
* `slug`

可选字段：

* `tags`
* `summary`
* `draft`

如果 `draft: true`，这篇笔记不应该被发布。

## Markdown 渲染规则

* Markdown 渲染器位于 `internal/markdown/`。
* 项目使用 goldmark 渲染 Markdown。
* 标准 Markdown / GFM 能力优先保持稳定。
* 不要把 Obsidian 双链、嵌入、callout 混进标准 Markdown 修复中。
* Obsidian 兼容功能必须分阶段实现。
* 修改 Markdown 渲染器后必须更新或新增测试。
* 修改正文样式时只作用于文章正文容器，例如 `.markdown` / `.post-content`，不要污染全站布局。
* 默认不要允许 Markdown 中的任意 HTML 直接注入危险内容。

## 命令

```bash
go run ./cmd/daybook build
go run ./cmd/daybook serve
```

`build` 负责生成 `public/`。`serve` 负责在 `http://localhost:1313` 预览 `public/`。

## 测试与验证

修改 Go 代码后运行：

```bash
gofmt
go test ./...
go run ./cmd/daybook build
```

如果修改了本地服务器相关代码，或需要人工预览页面，运行：

```bash
go run ./cmd/daybook serve
```

## Git 工作流

* 大改前先运行 `git status --short`。
* 不要在工作区不干净时继续改，除非用户明确要求继续处理当前改动。
* 每个功能使用独立分支。
* 不要自动 commit。
* 不要自动 merge。
* 不要自动 reset。
* 不要自动 clean。
* 回退前必须说明会影响哪些文件。
* Codex 修改后必须总结改动和测试结果。

## 开发流程

小步推进。

在进行较大修改前，先提出一个简短计划。每完成一步，说明：

* 修改了什么；
* 改动了哪些文件；
* 如何测试；
* 下一步建议做什么。

除非明确要求，否则不要重写整个项目。不要在没有解释原因的情况下添加大型依赖。不要删除 `content/notes/` 中的用户内容。

## 未来功能

当前未来功能顺序：

1. 修复并稳定 Markdown/GFM 渲染；
2. Obsidian wikilink；
3. Obsidian embed；
4. Obsidian callout；
5. backlinks；
6. graph JSON；
7. graph 页面；
8. tags 页面；
9. archive 页面；
10. search；
11. RSS / sitemap；
12. Cloudflare Pages 部署配置。

每个未来功能都应该作为单独步骤实现。不要一次实现多个未来功能。
