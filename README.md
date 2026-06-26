# Daybook

![Go Version](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat-square&logo=go)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)

Daybook 是一个由 Go 驱动的极简静态博客生成器与个人知识库主题。它的目标是将本地的 Markdown 笔记转化为高度互动的静态网站，且无需部署复杂的后端数据库或动态应用服务器。

它秉承了**前端极简、视觉高级**的设计理念：在服务端由 Go 完成快速的页面渲染和图谱关系计算，在前端由纯正的 TypeScript 提供无框架（Zero-Framework）的生动交互体验。它非常适合用于搭建个人博客、笔记分享、数字花园或基于 Obsidian 写作流的知识库。

---

## 功能特性

Daybook 提供了一系列为现代数字花园量身定制的功能：

* **基础页面**:
  * **首页 Hero**：精美的首屏展示设计。
  * **文章列表 (`/notes/`)**：按时间倒序排列的文章流。
  * **文章详情页**：干净、专注的阅读体验，支持自动生成的侧边大纲目录 (TOC)。
  * **归档 (`/archive/`)**：按年份整理的笔记存档。
  * **关于 (`/about/`)**：包含极具数学美感的**黄金分割螺旋 (Golden Ratio Spiral)** 背景特效。
* **交互与视觉**:
  * **页面过渡动画 (View Transitions)**：丝滑的页面跳转，包含标志性的文章标题无缝 Morph 缩放变形效果。
  * **明暗主题 (Dark Mode)**：支持操作系统自适应和手动切换的暗黑模式。
  * **关系图谱 (`/graph/`)**：全局与局部的节点关系力导向图，呈现知识链路。
  * **快速检索**：全局前端弹窗搜索与标签筛选系统。
* **丰富的内容扩展**:
  * 基于 `goldmark` 与定制扩展的 Markdown 渲染。
  * 集成第三方服务的灵活嵌入 (Bilibili, YouTube, GitHub, Spotify 等)。
  * 优雅的图片查看器 (Lightbox) 与图集组合 (Gallery)。
  * 原生级别的代码高亮与剪贴板复制。
  * 集成 Waline 评论系统。
  * 内置对 Mermaid 图表与 KaTeX 数学公式的渲染支持。
  * 自动生成的 RSS 订阅流。

---

## 技术栈

Daybook 的架构分为“构建时”与“运行时”：

**构建时 (后端引擎)**:
* **Go**: 承担整体站点的骨架构建。负责读取系统文件、解析 Frontmatter、HTML 模板渲染、RSS 生成、双向链接及图谱关系数据 (JSON) 计算。
* **goldmark**: 遵循 CommonMark 标准的高性能 Markdown 解析器。
* **Chroma**: 强大的代码语法高亮引擎。

**运行时 (前端增强)**:
* **TypeScript & esbuild**: 所有前端第一方交互逻辑采用严格类型 TypeScript 编写，并通过 esbuild 极速打包，彻底摒弃笨重的前端框架。
* **D3.js**: 用于计算与渲染互动关系图谱的物理碰撞与力导向模型。
* **KaTeX & Mermaid**: 在浏览器端实时渲染数学公式与复杂图表。
* **Waline**: 驱动文章的轻量级无后端评论组件。
* **Cloudflare Pages**: 推荐的首选边缘 CDN 静态托管平台。

---

## 项目结构

```text
daybook/
├── cmd/daybook/          # Go 程序的入口命令行文件
├── internal/             # Go 核心逻辑 (配置, 渲染, Markdown处理, 内容解析等)
├── templates/            # Go 标准库 HTML 模板 (布局与页面结构)
├── content/              
│   └── notes/            # 你撰写和存放的所有 Markdown 笔记文件
├── static/               # 不需要编译的纯静态资源 (字体, 图片, 样式, 基础图标)
│   ├── css/              # 全站 CSS (区分核心 tokens 与组件/页面层级)
│   └── js/vendor/        # 必须由 Git 跟踪的第三方库 (例如 d3.min.js, waline.js)
├── assets/ts/            # ❗️第一方前端 TypeScript 源码 (核心交互逻辑)
├── public/               # ⚠️ 构建生成的最终站点输出目录 (请勿手动修改或提交)
├── scripts/              # 自动化构建脚本 (TS编译、检查与启动)
└── go.mod, package.json  # 依赖配置文件
```

**关键说明**：
* `assets/ts/` 才是所有的前端源码，任何前端修改必须在此处进行。
* `static/js/*.js` 是 esbuild 由 TS 编译生成的**中间产物**。不要手动修改，且它们已在 `.gitignore` 中被忽略，不会被提交。

---

## 快速开始

### 依赖环境
* **Go**：具体版本以 `go.mod` 为准 (通常为 1.26+)。
* **Node.js & npm**：用于前端 TypeScript 脚本环境的依赖安装与打包。

### 本地安装与预览

1. 克隆项目：
```bash
git clone https://github.com/StatIndet/daybook.git
cd daybook
```

2. 安装前端依赖：
```bash
npm ci
```

3. 启动本地开发服务器：
```bash
npm run serve
```
启动后，访问 `http://localhost:1313` 即可预览。  
*提示：`npm run serve` 是一个包含前后端联动的并行命令。它会自动执行一次 TypeScript 严格校验，随后在后台开启 esbuild 的增量编译监听，并同步启动 Go 的本地服务。当你修改 `assets/ts/*.ts` 或模板内容时，页面刷新即可看到实时改变。*

---

## 构建命令详解

项目中定义了以下标准的 NPM 脚本来管理生命周期：

* `npm run typecheck`: 以严格模式对 `assets/ts/` 下的所有 TypeScript 代码进行无输出类型校验。
* `npm run build:js`: 调用 `esbuild` 脚本，将 TypeScript 编译、混淆并输出到 `static/js/` 目录中。
* `npm run build`: **核心生产构建命令**。它会依次执行：TS 校验 -> JS 打包 -> `go run` 生成完整的静态 HTML。最终的上线产物全部位于 `public/` 目录。
* `npm run serve`: 本地并发服务器。

### 字体资产构建 (Font Assets)

运行时的字体资产分为两大类，均被提交在 `static/vendor/fonts/` 下，因此**普通 Go 构建和页面加载不依赖 NPM 安装与网络。** 只有在更新字体源或修改了装饰字体文本时才需要重新生成：

* **运行时前端字体 (Vendor Fonts)**：管理正文字体 (LXGW WenKai Screen)、代码字体 (Maple Mono CN) 及图标字体 (Material Symbols)。
  LXGW WenKai Screen is used for prose/body text because it is more readable on screens than the standard LXGW WenKai package.

  `static/vendor/fonts/` contains generated runtime font assets and is intentionally committed.

  To refresh npm-managed runtime fonts:
  ```bash
  npm install
  npm run build:vendor-fonts
  ```

* **装饰性字体子集 (Decorative Fonts)**：管理 Logo、日期与签名的超小字体切片。
  如果您修改了相关的源文本，需要更新相应的 `.woff2`：
  ```bash
  npm run fetch:font-sources  # 如果缺少源字体，必须先通过网络拉取
  npm run build:decorative-fonts
  ```

---

## Cloudflare Pages 部署

Daybook 天生适合零成本部署到 Cloudflare Pages。在导入 Github 仓库后，请使用以下配置：

* **Build command (构建命令)**:
  ```bash
  npm ci && npm run build
  ```
* **Build output directory (构建输出目录)**:
  ```text
  public
  ```
* **Root directory (根目录)**:
  ```text
  /
  ```

如果 Cloudflare Pages 自动检测框架失败并给出默认值，请务必手动修改为以上参数，否则前端 JS 将无法成功构建。

---

## 内容写作

你所有的文章都存放在 `content/notes/` 目录中。文章采用标准 Markdown 编写，并在顶部使用 YAML 格式的 Frontmatter 声明元数据：

```yaml
---
title: "我的第一篇数字花园笔记"
date: "2026-06-20"
slug: "my-first-note"
tags: ["笔记", "Daybook"]
summary: "关于如何使用 Daybook 建立个人知识库的指南。"
draft: false
math: true
pin: false
comment: true
---

在这里开始你的书写...
```

**字段说明**：
* `title` (必填): 文章在标题和各处列表中的展示名。
* `date` (必填): 发布日期，决定归档与排序顺序。
* `slug` (必填): 决定文章的永久链接路径，如 `/notes/my-first-note/`。**请勿包含路径分隔符。**
* `tags`: 决定了文章所属的标签。它会直接反映在文章元信息与图谱节点的关联中。
* `summary`: 在文章列表页展示的引言。
* `draft`: 设置为 `true` 时，该文章将不会在正式构建中被生成和发布。
* `math`: 如果文章包含公式，可显式设置为 `true`，以提示框架按需加载 KaTeX，提高渲染性能。
* `pin`: 是否在列表或首页置顶（视具体主题逻辑而定）。
* `comment`: 设置为 `false` 可对单篇文章显式关闭 Waline 评论区。

---

## Markdown 扩展功能

除了原生 Markdown（含表格、任务列表、删除线、脚注等），Daybook 还在构建层定制了大量的交互式语法扩展：

### 代码块与高亮
纯粹的 GitHub 风格语法高亮，自带右侧悬浮复制按钮。
```go
func Hello() {
    fmt.Println("World")
}
```

### GitHub 风格提示框 (Alerts)
```markdown
> [!NOTE]
> 这是一条提示信息

> [!WARNING]
> 这是一条警告信息
```

### 折叠面板 (Fold)
用于隐藏长代码或包含剧透的折叠内容。
```markdown
::: fold [查看答案]
这里是被隐藏的内容。
:::
```

### 图片画廊 (Gallery)
将多张连续的图片自动包裹在一个网格布局中：
```markdown
::: gallery
![图片1](path1.jpg)
![图片2](path2.jpg)
:::
```

*(所有独立放置的图片默认自带图注渲染与点击放大的 Lightbox 支持)*

### 数学公式 (KaTeX)
支持行内 `$E=mc^2$` 与块级语法：
```markdown
$$
f(x) = \int_{-\infty}^\infty\hat f(\xi)\,e^{2 \pi i \xi x}\,d\xi
$$
```

### Mermaid 图表
```markdown
 ```mermaid
 graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
 ```
```

### 第三方富媒体嵌入 (Embeds)
提供无需 iFrame 胶水代码的优雅短代码扩展，目前支持的卡片包括：

* **GitHub Repo**: `:: github {repo="StatIndet/daybook"}`
* **YouTube**: `:: youtube {id="YOUR_VIDEO_ID"}`
* **Bilibili**: `:: bilibili {id="BV1xxxxxxxx"}`
* **Spotify**: `:: spotify {url="https://open.spotify.com/track/..."}`
* **CodePen**: `:: codepen {url="https://codepen.io/user/pen/slug"}`
* **X / Twitter**: `:: tweet {url="https://twitter.com/user/status/123456789"}`
* **网易云单曲**: `:: netease {type="song" id="12345" autostart="false"}`

---

## 评论系统 (Waline)

Daybook 原生兼容 [Waline](https://waline.js.org/) 无后端评论系统。这对于静态博客非常重要。

**配置说明**：
Daybook 本身不内置数据库，Waline 仅作为一个前端组件集成。你需要自行部署 Waline 服务端。随后在前端初始化配置 (通常位于 `assets/ts/waline-loader.ts` 及其引用的全站配置文件) 中指定你的 `serverURL`。

评论区默认仅在文章详情页底部加载。如果你希望某篇私密笔记不开放讨论，只需在 Frontmatter 中声明 `comment: false` 即可。当遇到评论无法加载的情况，请检查浏览器控制台的网络请求与 CORS 设置。

---

## 关系图谱

访问 `/graph/` 可以查看全站的知识脉络图谱。

* **生成机制**：在 Go 编译期间，系统会解析所有笔记的前后双链引用及 Tag 归属，并生成一个 `graph.json`。
* **物理渲染**：前端基于 `assets/ts/graph.ts` 和 D3.js 进行渲染，模拟排斥力与引力节点。
* **交互体验**：提供平移缩放、节点 hover 连线高亮、孤立节点过滤等强劲的前端交互过滤功能。

---

## 常见问题排查 (Troubleshooting)

* **`npm run build` 失败并报错找不到模块**
  通常是你忘记了安装依赖。请先执行 `npm ci` 或 `npm install`。
* **`go run ./cmd/daybook build` 报错找不到 JS 静态资源**
  如果你绕过了 `npm run build` 直接去跑了 Go 脚本，由于缺少 TS 编译环节，`static/js` 为空。请必须走 NPM 构建管线。
* **修改了 TS 代码，但页面上的行为没变化？**
  如果你是以 `go run ./cmd/daybook serve` 单独启动后端的，那 TypeScript 不会被重新编译。请使用 `npm run serve` 让增量编译器在后台一并工作。
* **我的 Mermaid / KaTeX 没有渲染？**
  请确保代码块标记规范。如果是数学公式，请确认文章 Frontmatter 中声明了 `math: true` 以让系统下发对应的 CSS 与 JS。
* **`public/` 目录需要被 commit 吗？**
  绝对不要。`.gitignore` 已将其排除。那是部署平台才需要关心的构建一次性产物。

---

## 贡献与开发指南

我们欢迎 PR 与社区贡献。当你想要修改页面或核心功能时，请遵循职责隔离：
* **核心结构 / 数据流**：请移步 `internal/`。
* **页面布局 / DOM**：请移步 `templates/`。
* **前端交互逻辑**：**永远在 `assets/ts/` 中修改，不要碰 `static/js`**。
* **样式调整**：修改 `static/css/`。

请在提交代码前，务必保证以下命令顺利执行：
```bash
npm run typecheck
npm run build
```

---

## 致谢

Daybook 的部分视觉设计与 Markdown 语法扩展灵感大量汲取了开源社区的智慧，特别致谢：

* 设计与排版参考：[**astro-theme-retypeset**](https://github.com/radishzz/astro-theme-retypeset) by radishzz。我们在 Go 环境下对该主题优雅的文章排版 (`/notes/`) 与语法扩展思路进行了重新实现。

此外，本项目依赖以下卓越的开源技术栈 (Powered by)：
* **Go Markdown 解析**: [goldmark](https://github.com/yuin/goldmark)
* **代码高亮**: [Chroma](https://github.com/alecthomas/chroma)
* **数学引擎**: [KaTeX](https://github.com/KaTeX/KaTeX)
* **图谱引擎**: [D3.js](https://d3js.org/)
* **评论组件**: [Waline](https://waline.js.org/)
* **图表渲染**: [Mermaid](https://mermaid.js.org/)

## License

本项目基于 [MIT License](LICENSE) 开源。

Copyright (c) 2026 史帙

*参考项目 `astro-theme-retypeset` 与上述所有引用的第三方组件均遵循其各自的 MIT/BSD/ISC 等开源授权协议。*
