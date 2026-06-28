# Completed Features

The following features have been completely implemented in the Daybook project. The project is currently in its maintenance phase.

## 核心功能 (Core Features)
- [x] 静态页面生成 (SSG): 基础首页、文章列表、文章详情。
- [x] 基于 goldmark 的 Markdown/GFM 标准渲染。
- [x] Frontmatter (YAML) 数据解析。
- [x] 全局 Persistent Logo 与 Side Navigation。
- [x] 跨页面的 View Transitions (共享元素切换) 动画。
- [x] 自适应与手动切换的深色模式 (Dark Mode)。

## Obsidian 兼容性 (Obsidian Compatibility)
- [x] Obsidian Wikilinks (`[[link]]`) 解析与链接生成。
- [x] Obsidian Embed (`![[embed]]`) 支持，包括页面嵌入、标题嵌入与块嵌入。
- [x] Obsidian Callouts (`> [!note]`) 与 GitHub 风格 Alerts 的原生支持与视觉兼容。
- [x] Obsidian Highlights (`==text==`) 语法支持。
- [x] Obsidian Comments (`%%comment%%`) 语法剥离支持。
- [x] 动态推断式远程附件挂载（无缝衔接 Cloudflare R2）。

## 高级功能 (Advanced Features)
- [x] 全局检索 (`/search` 前端弹窗检索)。
- [x] 按年份归档页面 (`/archive/`)。
- [x] 全局标签页面与过滤系统 (`/tags/`)。
- [x] RSS 订阅与 Sitemap 生成。
- [x] 交互式全局设置面板 (Settings Overlay)。
- [x] 全站双语翻译对照 (i18n Bilingual Support)。
- [x] 文章目录大纲 (TOC)。
- [x] Mermaid 渲染。
- [x] KaTeX 数学公式渲染。

## 媒体与评论 (Media & Interactions)
- [x] 媒体管理器 (Global Media Manager)：Lightbox 全屏阅览与 Gallery 网格布局。
- [x] Waline 评论系统无缝集成。
- [x] Cloudflare D1 Serverless 访客统计 (Page Views, Total Views, Unique Visitors)。
- [x] 自动外链卡片生成 (Bilibili, YouTube, GitHub, Spotify 等嵌入)。

## 数据可视化 (Data Visualization)
- [x] 后端 Graph JSON 数据抽取与生成。
- [x] 带有 D3.js 物理引擎的 2D 交互式关系图谱 (`/graph/`)。
- [x] 反向链接 (Backlinks) 列表计算与页面展示。

*(Note: ROADMAP.md has been archived as all planned features for Phase 1 have been completed.)*
