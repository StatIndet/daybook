# Design Notes

daybook 的当前视觉结构已经稳定，本文件只记录维护边界。

## Stable Areas

* `.persistent-logo` 已稳定，不要修改位置、字号、字体或结构。
* side-nav 已稳定，不要修改头像位置、链接顺序或导航结构。
* 首页 hero 已稳定，不要修改头像、昵称、slogan、社交图标布局。
* 文章列表页和文章详情页布局已稳定，结构重构时应保持 class 和语义不变。

## CSS Layers

`static/css/global.css` 是入口文件，并按职责导入 tokens、fonts、base、layout、components、markdown、transitions 和页面样式。

## Template Layers

`templates/layouts/` 放基础布局，`templates/pages/` 放页面模板，`templates/partials/` 放复用片段。

结构重构只移动边界，不重新设计 UI。

## Serverless Edge Architecture

本项目的部署模型不仅仅是一个静态站点，它还深度集成了 Cloudflare 的边缘计算与存储能力，以实现零后端的全站交互。

### 1. 边缘动态访问统计 (Edge Stats with D1)
尽管 Daybook 主要是 SSG (Static Site Generator)，但它使用 **Cloudflare Pages Functions + D1 (Serverless SQLite)** 实现了全站访客、独立访客 (UV) 和单页阅读量 (PV) 的统计。
- **架构**：在 `functions/api/hit.ts` 与 `stats.ts` 中处理所有计数与查询请求。
- **性能**：使用 D1 的 Batch API 将页阅读、全站阅读和独立访客追踪合并为一个数据库事务。
- **隐私**：前端通过 `crypto.randomUUID()` 颁发 `localStorage` 访问凭证，后端通过带有 `STATS_SALT` 的 `SHA-256` 摘要哈希加密，杜绝用户隐私泄漏。

### 2. 动态 R2 附件挂载推断 (Dynamic Remote Resolution)
为了解决大型音视频、PDF 及图片文件体积过大、拖慢 Git 仓库的问题，项目实现了动态的 Obsidian 附件推断。
- **解耦机制**：在 `.gitignore` 中忽略子目录（如 `audio/`, `video/`）的大文件提交。
- **运行时推断**：在 Markdown 解析器 (`internal/obsidian/obsidian.go`) 中拦截文件缺失错误。若发现请求路径命中了 `config.yaml` 定义的 `RemoteDirs`，解析引擎会自动将其推断为合法文件，并无缝拼接 `RemoteBaseURL` 指向 Cloudflare R2。
- **结果**：完全本地化的双链书写体验 + 零成本的远程大型对象存储托管，且不会在 CI 部署阶段引发“文件丢失”报错。
