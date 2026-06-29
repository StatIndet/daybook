# Daybook

![Go Version](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat-square&logo=go)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)

Daybook 是一个由 Go 和 TypeScript 编写的静态博客生成器。它的目标是将本地的 Markdown 笔记转化为静态网站，无需部署后端数据库或动态应用服务器。

在服务端，Go 负责页面渲染和图谱关系计算；在前端，TypeScript 提供原生的页面交互。适用于搭建个人博客或基于 Obsidian 写作流的知识库。

---

## 核心架构与设计特点

* **零前端框架依赖**：前端代码基于原生 TypeScript 编写，未引入 React 或 Vue 等大型框架。
* **全局无刷新路由**：实现类似单页应用（SPA）的路由接管，页面跳转全程无刷新，结合 View Transitions 提供平滑的视觉过渡。
* **原生双语支持**：内置完善的 i18n 多语言机制，支持中英文平滑切换，并包含完备的翻译回退与列表过滤策略。
* **兼容 Obsidian**：1:1 实现了 Obsidian 的 Markdown 扩展特性（包括双向链接、嵌入引用、Callout 提示块），并原样还原了底层关系图谱（Graph View）。
* **移动端适配**：针对手机设备进行专门的 UI 布局与动画交互适配。

---

## 截图预览

### 桌面端界面

| 首页 (Home) | 笔记列表 (Notes) |
| :---: | :---: |
| ![首页](screenshot/首页.png) | ![笔记](screenshot/笔记.png) |
| **归档视图 (Archive)** | **关系图谱 (Graph)** |
| ![归档](screenshot/归档.png) | ![关于](screenshot/关系图谱.png) |
| **KaTeX 公式渲染** | **第三方媒体嵌入** |
| ![KaTeX公式](screenshot/KaTeX公式.png) | ![内嵌iframe](screenshot/内嵌iframe.png) |
| **偏好设置 (Settings)** | **关于页与设置面板 (About & Settings)** |
| ![偏好设置](screenshot/偏好设置.png) | ![关系图谱](screenshot/about界面.png) |

### 移动端响应式布局

| 顶部进度条 | 文章阅读 | 侧边栏抽屉 |
| :---: | :---: | :---: |
| ![手机端适配1](screenshot/手机端适配1.png) | ![手机端适配2](screenshot/手机端适配2.png) | ![手机端适配3](screenshot/手机端适配3.png) |

---

## 功能特性

* **基础页面**:
  * **首页 Hero**：首屏展示。
  * **文章列表 (`/notes/`)**：按时间倒序排列。
  * **文章详情页**：支持自动生成的侧边大纲目录 (TOC)。
  * **归档 (`/archive/`)**：按年份整理的笔记存档。
  * **关于 (`/about/`)**：包含黄金分割螺旋 (Golden Ratio Spiral) 背景。
* **交互与视觉**:
  * **页面过渡动画 (View Transitions)**：支持页面跳转时的共享元素动画。
  * **明暗主题 (Dark Mode)**：支持操作系统自适应和手动切换暗黑模式。
  * **关系图谱 (`/graph/`)**：全局与局部的节点关系力导向图。
  * **检索系统**：前端弹窗搜索与标签筛选。
  * **全局控制面板 (Settings Overlay)**：点击博客左上角的 Daybook logo 后唤出的页面控制层，提供以下用户偏好调整：
    * 切换是否使用系统默认光标。
    * 禁用后台播放（停止非必需的后台多媒体运行，默认勾选）。
    * 禁用评论区（全局隐藏评论模块）。
    * 减少动画（关闭部分过渡动画）。
  * **双语对照 (i18n Bilingual)**：英汉双语对照及状态切换。
  * **访问统计 (D1 Serverless Stats)**：基于 Cloudflare 边缘计算与 D1 数据库，实现访客 (UV) 和阅读量 (PV) 追踪。
* **内容扩展**:
  * 基于 `goldmark` 的 Markdown 渲染，兼容 Obsidian 语法（嵌入、Callout、双链、Highlight等）。具体说明见 [Markdown 语法说明](https://daybook.page/notes/markdown-syntax/)。
  * 第三方服务嵌入 (Bilibili, YouTube, GitHub, Spotify 等)。
  * **媒体管理器 (Media Manager)**：灯箱 (Lightbox) 画廊查看，支持远程文件加载。
  * 代码高亮与剪贴板复制。
  * 集成 Waline 评论系统。
  * Mermaid 图表与 KaTeX 数学公式渲染。
  * 生成 RSS 订阅与 XML Sitemap。

---

## 技术栈

**构建时 (后端)**:
* **Go**: 承担站点构建，包括读取文件、解析 Frontmatter、HTML 模板渲染、RSS 生成、双向链接及图谱数据 (JSON) 计算。
* **goldmark**: Markdown 解析器。
* **Chroma**: 代码语法高亮。

**运行时 (前端)**:
* **TypeScript & esbuild**: 前端交互逻辑采用 TypeScript 编写，通过 esbuild 打包。
* **D3.js**: 计算与渲染关系图谱的物理碰撞与力导向模型。
* **KaTeX & Mermaid**: 在浏览器端渲染数学公式与图表。
* **Waline**: 无后端评论组件。
* **Cloudflare Pages**: 推荐的部署平台。

---

## 项目结构

```text
daybook/
├── cmd/daybook/          # Go 程序的入口命令行文件
├── internal/             # Go 核心逻辑 (配置, 渲染, Markdown处理, 内容解析等)
├── templates/            # Go 标准库 HTML 模板 (布局与页面结构)
├── content/              
│   ├── notes/            # Markdown 笔记文件
│   └── attachments/      # 附件目录（支持区分本地文件与远程对象存储）
├── static/               # 不需要编译的静态资源 (字体, 图片, 样式, 基础图标)
│   ├── css/              # 全站 CSS
│   └── js/vendor/        # 由 Git 跟踪的第三方库 (如 d3.min.js, waline.js)
├── assets/ts/            # 第一方前端 TypeScript 源码
├── public/               # 构建生成的输出目录 (请勿手动修改或提交)
├── scripts/              # 自动化脚本 (TS编译、检查与启动)
└── go.mod, package.json  # 依赖配置文件
```

**说明**：
* `assets/ts/` 是前端源码目录，修改前端逻辑在此处进行。
* `static/js/*.js` 是 esbuild 由 TS 编译生成的中间产物，已在 `.gitignore` 中忽略，不需要提交。

---

## 快速开始

### 依赖环境
* **Go**：版本以 `go.mod` 为准 (通常为 1.26+)。
* **Node.js & npm**：用于前端 TypeScript 依赖安装与打包。

### 本地安装与预览

1. 克隆项目：
```bash
# 将远程仓库代码克隆到本地
git clone https://github.com/StatIndet/daybook.git
cd daybook
```

2. 安装前端依赖：
```bash
# 根据 package-lock.json 安装确切版本的前端依赖，不修改锁定文件
npm ci
```

3. 启动开发服务器：
```bash
# 启动本地开发环境，包含前端 esbuild 的增量编译监听和 Go 本地预览服务
npm run serve
```
访问 `http://localhost:1313` 进行预览。  

---

## 构建命令

* `npm run typecheck`: 运行 TypeScript 编译器，对 `assets/ts/` 下的代码进行静态类型校验，不生成任何输出。
* `npm run build:js`: 使用 `esbuild` 将 TypeScript 源码编译、打包并压缩，输出到 `static/js/` 目录。
* `npm run build`: 生产环境完整构建命令。依次执行类型校验、前端资源打包，最后运行 `go run` 读取 Markdown 并生成最终静态 HTML 文件到 `public/` 目录。
* `npm run serve`: 启动并发环境，一边监听前端 TS 文件的修改自动打包，一边运行 Go 的本地 Web 服务进行预览。

### 字体构建

字体资产在 `static/vendor/fonts/` 下，普通的 Go 构建不需要依赖 NPM 安装与网络。在更新源文件时才需要重新生成：

* **运行时字体**：包括正文字体 (LXGW WenKai Screen)、代码字体 (Maple Mono CN) 及图标字体 (Material Symbols)。
  ```bash
  # 安装必要的构建工具
  npm install
  # 处理并输出字体文件到静态目录
  npm run build:vendor-fonts
  ```

* **装饰性字体**：Logo、日期与签名的字体切片。如果你需要修改相关文本，请在 `/tools/font-subsets/glyphs` 目录下的相应文件中修改文本内容，然后执行以下命令来更新装饰性字体的范围：
  ```bash
  # 从网络拉取源字体文件（如果本地没有）
  npm run fetch:font-sources
  # 根据 glyphs 目录中的文本重新生成子集 woff2 字体
  npm run build:decorative-fonts
  ```

---

## Cloudflare Pages 部署

导入 Github 仓库后，使用以下配置：

* **Build command**: `npm ci && npm run build`
* **Build output directory**: `public`
* **Root directory**: `/`

---

## 内容写作

文章存放在 `content/notes/` 目录中，使用 Markdown 编写，顶部使用 YAML 格式的 Frontmatter 声明元数据：

```yaml
---
title: "我的第一篇笔记"
date: "2026-06-20"
updated: "2026-06-22"
slug: "my-first-note"
lang: "zh"
i18n_key: "note-1"
tags: ["笔记", "Daybook"]
summary: "关于如何使用 Daybook 的说明。"
draft: false
listed: true
math: true
pin: false
comment: true
---

在这里开始你的书写...
```

**字段说明**：
* `title` (必填): 文章在标题和列表中的展示名。
* `date` (必填): 发布日期，用于归档与排序。
* `updated` (可选): 文章的最后更新日期。未填默认不显示。
* `slug` (必填): 决定文章的路径，如 `/notes/my-first-note/`。不要包含路径分隔符。
* `lang` (可选): 文章的语言，如 `zh` 或 `en`。未填默认使用站点全局语言配置。
* `i18n_key` (可选): 用于多语言双语对照的唯一标识键。未填默认无多语言映射。
* `tags` (可选): 文章的标签数组。未填默认为空。
* `summary` (可选): 列表页展示的摘要。未填默认为空。
* `draft` (可选): 设置为 `true` 时，文章不会在正式构建中发布。未填默认为 `false`。
* `listed` (可选): 设置为 `false` 时，文章不会出现在列表、归档及全局图谱中（仅可通过直接链接访问）。例如，`https://daybook.page/notes/hello-daybook/` 没有被博客收录，但是可以通过直连访问。未填默认为 `true`。
* `math` (可选): 文章包含公式时设置为 `true`，以加载 KaTeX。未填默认为 `false`。
* `pin` (可选): 是否在列表或首页置顶。未填默认为 `false`。
* `comment` (可选): 设置为 `false` 可对单篇文章关闭 Waline 评论区。未填默认为 `true`（开启评论）。

---

## 附件与远程存储 (Cloudflare R2)

项目对大型附件（如音视频、PDF、高清图片）实现了与 Git 仓库解耦的远程挂载机制：
* **目录规则**：
  * 存放在 `content/attachments/` 根目录下的文件会被视为本地文件，并随站点一起打包部署。
  * 存放在 `content/attachments/audio/`、`video/`、`pdf/`、`picture/` 等子目录中的文件被 `.gitignore` 排除，不会被提交到 Git 仓库。
* **Cloudflare R2 配合**：
  你可以将上述子目录中的大文件手动上传到 Cloudflare R2（或其他对象存储），并绑定自定义域名。
  当在 Markdown 中使用如 `![[video.mp4]]` 引用时，系统若在本地找不到该文件，解析引擎会自动将其路径重定向到预设的远程 R2 域名进行加载。这可以确保本地书写双链时的流畅体验，同时节约仓库存储空间。

---

## 评论系统 (Waline)

Daybook 兼容 [Waline](https://waline.js.org/) 评论系统。
Daybook 不内置数据库，需自行部署 Waline 服务端，并在前端初始化配置 (通常在 `assets/ts/waline-loader.ts`) 中指定 `serverURL`。
如果不希望某篇笔记开放讨论，在 Frontmatter 中声明 `comment: false` 即可。

---

## 关系图谱

访问 `/graph/` 可查看全站知识脉络图谱。
* **生成机制**：Go 编译期间解析笔记的引用及 Tag，生成 `graph.json`。
* **物理渲染**：前端基于 `assets/ts/graph.ts` 和 D3.js 渲染。
* **交互体验**：提供平移缩放、连线高亮、孤立节点过滤等功能。

---

## 贡献与开发指南

* **核心结构 / 数据流**：在 `internal/` 修改。
* **页面布局 / DOM**：在 `templates/` 修改。
* **前端交互逻辑**：在 `assets/ts/` 修改，不要直接修改 `static/js`。
* **样式调整**：在 `static/css/` 修改。

提交代码前请保证以下命令执行成功：
```bash
# 类型校验
npm run typecheck
# 完整构建流程
npm run build
```

---

## 致谢

部分视觉设计与 Markdown 扩展参考了社区开源项目：
* 设计与排版参考：[astro-theme-retypeset](https://github.com/radishzz/astro-theme-retypeset) by radishzz。

依赖的开源组件：
* [goldmark](https://github.com/yuin/goldmark)
* [Chroma](https://github.com/alecthomas/chroma)
* [KaTeX](https://github.com/KaTeX/KaTeX)
* [D3.js](https://d3js.org/)
* [Waline](https://waline.js.org/)
* [Mermaid](https://mermaid.js.org/)

## License

本项目基于 [MIT License](LICENSE) 开源。

Copyright (c) 2026 史帙
