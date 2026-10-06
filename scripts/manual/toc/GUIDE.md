# Optional TOC diagnostics

这些检查只在排查目录、阅读进度曲线或移动端目录时手动运行。整个目录不接入
`scripts/check.sh`、默认 CI 或 Release；包括纯数学检查在内，统一使用下面的入口。

在仓库根目录安装一次依赖和浏览器：

```sh
npm ci
npx playwright install chromium
```

Linux 若提示缺少浏览器系统库，可手动运行 `npx playwright install --with-deps chromium`。
入口不会自动下载浏览器或安装系统依赖。

```sh
# 自包含检查：曲线数学、端点折回、SVG 几何、Chromium 截图像素边界
npm run test:toc

# 加测真实文章：桌面进度条、沉浸模式目录、移动端目录打开/关闭
npm run test:toc -- --article http://127.0.0.1:1313/notes/example/

# 加测已有外部 vault：入场、吸顶、多个屏宽、标题标签、触摸及锚点跳转
npm run test:toc -- --vault http://127.0.0.1:1415
```

`--article` 需要一个已启动服务的构建结果，文章至少有两个标题，且内容足够长，
能在 2560×1440 视口中滚动 500px。修改源码后先重建前端资源和 CLI，再构建测试 vault。

`--vault` 复用 `scripts/vault-browser-test.mjs` 的本地集成检查环境，筛选 TOC 用例。
该环境还要求中文、英文示例文章，用以下变量指定文章标题：
`DAYBOOK_TEST_TOC_TITLE`、`DAYBOOK_TEST_ZH_TITLE`、`DAYBOOK_TEST_EN_TITLE`。
TOC 示例至少需要六个标题，并有足够长的正文用于滚动和长标题检查。
截图及结果写入 `DAYBOOK_TEST_OUTPUT_DIR`，默认 `/tmp/daybook-vault-browser`。
这些服务和文章均由调用者准备，检查不会改动 vault 源文件。

文件说明：

- `run.mjs`：统一入口，任何子检查失败均返回非零退出码。
- `reading-rail.mjs`：原有数学、SVG 和像素检查，无需站点服务。
- `browser.mjs`：从默认浏览器冒烟测试中移出的文章 TOC 检查。
- `vault-checks.mjs`：从本地 vault 检查中归拢的 TOC 场景。

这些检查只覆盖 Chromium 和指定场景。模拟时间下的 SVG 几何与若干静态截图
不能证明真实滚动的每一帧都平滑；处理动画或兼容性问题时，仍需在目标浏览器中观察。
