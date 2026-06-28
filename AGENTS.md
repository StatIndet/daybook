# AGENTS.md

## 项目概述

`daybook` 是一个使用 Go 编写的极简静态博客与 Obsidian 笔记发布工具。

项目目标是将 `content/notes/` 目录中的 Markdown 笔记转换成 `public/` 目录中的静态网站。当前项目已进入 **维护与重构期 (Maintenance Phase)**，所有核心特性（包括深色模式、共享元素切换动画、全站双语、设置面板、Obsidian 语法全兼容、Waline 评论、D1 Serverless 访问统计等）均已稳定上线。

这个网站在架构上依然保持轻量纯粹，但在交互与功能上已具备高度现代化特征（如 Edge Functions 边缘计算和零框架前端原生 TypeScript 交互）。最终网站被设计为通过 Cloudflare Pages 部署，并绑定自定义域名：

```text
https://daybook.page
```

## 用户背景

项目所有者是 Go 和 HTML 的初学者。

修改代码时，优先选择简单、可读、适合初学者理解的实现方式，而不是聪明但复杂的抽象。必要时可以加入简短注释解释关键思路，但不要给显而易见的代码添加过多注释。

## 当前已完成核心能力

* **基础与视觉**：首页 Hero、文章列表、文章详情、侧边导航、明暗主题自适应、全局 View Transitions 共享元素切换动画。
* **Markdown 与 Obsidian 兼容**：原生 GFM、Frontmatter 解析、Obsidian Wikilink 双向链接、嵌入 (Embed)、Callout、代码高亮 (Chroma)、数学公式 (KaTeX)、图表 (Mermaid)。
* **高级扩展**：全局标签 (`/tags/`)、按年份归档 (`/archive/`)、全局前端检索弹窗、RSS/Sitemap 生成。
* **交互增强**：全站媒体管理器 (Media Manager, Lightbox/Gallery)、多语言双语对照切换 (i18n)、全局控制面板 (Settings Overlay)。
* **边缘计算与评论**：基于 Cloudflare Pages Functions 与 D1 数据库的零后端全站访问统计，以及 Waline 评论系统集成。
* **构建与发布**：动态远端附件推断 (`RemoteDirs`) 支持 R2 大文件挂载，本地 `npm run build` 一键极速输出纯静态资源。

## 项目当前阶段

项目核心特性已经开发完毕并进入**维护与重构期**。
在此阶段，AI Agent 的主要目标是：
1. **优先保障现有功能的稳定性**：在修改代码前必须充分考虑对现有特性的影响。
2. **代码重构与优化**：提升 TypeScript 和 Go 代码的可读性、可维护性。
3. **修复边界 Bug**：处理极端分辨率下的 UI 瑕疵或罕见的 Markdown 解析边缘情况。
4. 除非用户明确要求，否则**不再引入**大型新功能或新的外部依赖。

## 当前项目结构

```text
daybook/
├── cmd/daybook/
├── internal/
│   ├── config/
│   ├── content/
│   ├── markdown/
│   ├── render/
│   ├── site/
│   ├── obsidian/
│   ├── graph/
│   ├── search/
│   └── feed/
├── content/
│   ├── notes/
│   ├── pages/
│   └── attachments/
├── templates/
│   ├── layouts/
│   ├── pages/
│   └── partials/
├── static/
│   ├── css/
│   │   └── pages/
│   ├── js/
│   ├── fonts/
│   ├── images/
│   │   └── avatar/
│   └── icons/
│       └── social/
├── scripts/
├── docs/
├── public/
├── config.yaml
├── go.mod
├── go.sum
├── README.md
└── AGENTS.md
```

`public/` 是构建产物。默认不要手动编辑 `public/`，也不要提交 `public/`，除非用户明确要求。

## Go 代码分层

* `cmd/daybook/` 只负责命令入口。
* `internal/config/` 负责配置读取。
* `internal/content/` 负责读取和解析内容文件。
* `internal/markdown/` 负责 Markdown 到 HTML 的渲染。
* `internal/render/` 负责 Go HTML 模板渲染。
* `internal/site/` 负责站点构建流程。
* `internal/obsidian/`、`internal/graph/`、`internal/search/`、`internal/feed/` 是未来功能边界，当前不要写无关实现。

Go 代码应保持简单：

* 尽可能使用 Go 标准库；
* 保持 package 小而专注；
* 返回错误，而不是直接 panic；
* 包装错误时使用 `fmt.Errorf("上下文: %w", err)`；
* 修改 Go 文件后运行 `gofmt`；
* 早期版本中避免不必要的 interface。

## 模板分层

* `templates/layouts/base.html` 是全局基础布局。
* `templates/pages/` 放页面级模板。
* `templates/partials/` 放可复用片段。
* 使用 Go 的 `html/template`。
* 保持模板简单、清晰、可读。
* 不要引入前端框架或模板打包工具。
* 不要复制多个视觉不一致的 persistent logo。
* 不要把 side-nav 和 persistent logo 混在一起。

## CSS 分层

`static/css/global.css` 是唯一入口，页面只应引用 `/css/global.css`。

CSS 按职责拆分：

* `tokens.css`：颜色、字体变量、尺寸变量、动画变量；
* `fonts.css`：`@font-face`；
* `base.css`：基础元素；
* `layout.css`：全局布局、persistent logo、side-nav；
* `components.css`：导航、按钮、tooltip、TOC 控件等组件；
* `markdown.css`：文章正文 Markdown 样式；
* `transitions.css`：页面切换、view transition、stagger 动画；
* `pages/home.css`：首页；
* `pages/notes.css`：文章列表页；
* `pages/note.css`：文章详情页。

修改正文样式时只作用于文章正文容器，例如 `.markdown` / `.post-content`，不要污染全站布局。

## Static 资源规则

* 字体保留在 `static/fonts/`。
* 头像保留在 `static/images/avatar/`。
* 社交 SVG 图标保留在 `static/icons/social/`。
* 中英文字体优先使用 `static/fonts/maple/` 中的 Maple 字体。
* 图标优先使用 `static/fonts/material-symbols/` 中的 Material Symbols。
* 不要使用 Google Fonts CDN 或其他外部 CDN。
* 不要删除或压缩用户提供的图片、SVG、字体资源。

## Content 目录规则

* 文章 Markdown 放在 `content/notes/`。
* `content/pages/` 预留给 about 等独立页面，当前不要实现页面渲染。
* `content/attachments/` 预留给 Obsidian 附件、图片、PDF，当前不要实现附件处理。
* 不要删除 `content/notes/` 中的用户内容。

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
* 默认不要允许 Markdown 中的任意 HTML 直接注入危险内容。

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

## 命令

```bash
go run ./cmd/daybook build
go run ./cmd/daybook serve
scripts/check.sh
scripts/build.sh
scripts/clean.sh
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

除非明确要求，否则不要重写整个项目。不要在没有解释原因的情况下添加大型依赖。不要一次实现多个未来功能。

## 维护期要求

由于项目已处于稳定维护期：

* 对于任何新需求的引入，必须先与用户进行充分的方案确认（`/grill-me`）。
* **UI/UX 微调**：确保改动不会破坏全局响应式布局及已有的 View Transitions 过渡动画。
* **后端改动**：保持 `internal` 下各包的独立性，警惕循环依赖。
* **前端改动**：所有的 TS 修改都必须在 `assets/ts/` 中完成，并通过 `npm run build:js` 编译，绝对不要直接修改 `static/js/`。
