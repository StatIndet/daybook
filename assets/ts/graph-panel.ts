import type { GraphSettings } from "./graph-settings";

const words = {
  settings: ["图谱设置", "Graph settings"],
  center: ["回到中心", "Recenter"],
  full: ["返回完整图谱", "Full graph"],
  close: ["关闭", "Close"],
  reset: ["恢复默认", "Restore defaults"],
  appearance: ["外观", "Display"],
  forces: ["力度", "Forces"],
  search: ["搜索", "Search"],
  query: ["搜索文件或正文…", "Search files or content…"],
  tags: ["标签", "Tags"],
  attachments: ["附件", "Attachments"],
  existing: ["仅显示已创建的笔记", "Existing notes only"],
  orphans: ["孤立节点", "Orphans"],
  arrows: ["箭头", "Arrows"],
  textFade: ["文字淡出阈值", "Text fade threshold"],
  nodeSize: ["节点大小", "Node size"],
  lineWidth: ["连线粗细", "Link thickness"],
  centerForce: ["图谱向心力", "Center force"],
  repelForce: ["节点排斥力", "Repel force"],
  linkForce: ["连接吸引力", "Link force"],
  linkDistance: ["连线长度", "Link distance"],
  play: ["播放生长动画", "Growth animation"],
  retry: ["重试", "Retry"],
  empty: [
    "没有匹配的节点，请调整筛选。",
    "No matching nodes. Adjust your filters.",
  ],
  count: ["个节点", "nodes"],
  loading: ["正在加载搜索索引…", "Loading search index…"],
  loadError: [
    "搜索索引加载失败，可重试或使用 path/file/tag 筛选。",
    "Search index unavailable. Retry or use path/file/tag filters.",
  ],
  graphError: ["图谱加载失败，请重试。", "Unable to load graph. Please retry."],
  help: ["查询语法", "Query syntax"],
  helpText: [
    "空格：同时满足 · OR：任一满足 · -：排除 · 引号：短语。",
    "Space: AND · OR: either · -: exclude · quotes: phrase.",
  ],
  pathHelp: ["路径", "Path"],
  fileHelp: ["文件名", "Filename"],
  tagHelp: ["标签及子标签", "Tag and descendants"],
  lineHelp: ["同一行", "Same line"],
  sectionHelp: ["同一章节", "Same section"],
  propertyHelp: ["公开属性", "Public property"],
  noDates: ["当前筛选没有可用于动画的日期", "No dated notes in this selection"],
  storage: ["设置保存在此浏览器中", "Settings saved in this browser"],
} as const;
export function graphText(key: keyof typeof words): string {
  return words[key][
    document.documentElement.lang.toLowerCase().startsWith("en") ? 1 : 0
  ];
}
export type Panel = ReturnType<typeof createGraphPanel>;
export function createGraphPanel(
  host: HTMLElement,
  get: () => GraphSettings,
  change: (key: keyof GraphSettings) => void,
  actions: {
    center(): void;
    reset(): void;
    full(): void;
    play(): void;
    retry(): void;
  },
) {
  const disposers: (() => void)[] = [];
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls = "",
    text = "",
  ) => {
    const n = document.createElement(tag);
    n.className = cls;
    n.textContent = text;
    return n;
  };
  const button = (text: string, action: () => void, cls = "graph-button") => {
    const b = el("button", cls, text);
    b.type = "button";
    b.onclick = action;
    return b;
  };
  host.replaceChildren();
  const toolbar = el("div", "graph-toolbar");
  const panel = el("aside", "graph-panel");
  panel.id = "graph-settings-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", graphText("settings"));
  const iconButton = (
    label: keyof typeof words,
    icon: string,
    action: () => void,
  ) => {
    const control = button("", action, "notes-action-button");
    control.setAttribute("aria-label", graphText(label));
    control.setAttribute("data-tooltip", graphText(label));
    const symbol = el("span", "material-symbol", icon);
    symbol.setAttribute("aria-hidden", "true");
    control.append(symbol, el("span", "graph-action-text", graphText(label)));
    return control;
  };
  const toggle = iconButton("settings", "tune", () => setOpen(!!panel.hidden));
  toggle.id = "graph-settings-btn";
  toggle.setAttribute("aria-controls", panel.id);
  toggle.setAttribute("aria-expanded", "false");
  const center = iconButton("center", "center_focus_strong", actions.center);
  center.id = "graph-reset";
  const full = iconButton("full", "zoom_out_map", actions.full);
  full.hidden = !new URLSearchParams(location.search).has("node");
  const search = iconButton("search", "search", () =>
    setSearchOpen(!!searchPanel.hidden),
  );
  search.id = "graph-search-btn";
  search.setAttribute("aria-controls", "graph-local-search-panel");
  search.setAttribute("aria-expanded", "false");
  const shortcuts = new Map<
    "showOrphans" | "showTags" | "showAttachments" | "existingOnly",
    HTMLButtonElement
  >();
  toolbar.append(search);
  for (const [key, label, icon, id] of [
    ["showOrphans", "orphans", "scatter_plot", "graph-orphan-btn"],
    ["showTags", "tags", "sell", "graph-tags-btn"],
    ["showAttachments", "attachments", "attach_file", "graph-attachments-btn"],
    ["existingOnly", "existing", "description", "graph-existing-btn"],
  ] as const) {
    const shortcut = iconButton(label, icon, () => {
      get()[key] = !get()[key];
      syncToggles();
      change(key);
    });
    shortcut.id = id;
    shortcuts.set(key, shortcut);
    toolbar.append(shortcut);
  }
  const play = iconButton("play", "play_arrow", actions.play);
  play.id = "graph-play";
  play.setAttribute("aria-pressed", "false");
  play.disabled = true;
  toolbar.append(play, center, toggle, full);
  const searchPanel = el("div", "graph-search-panel");
  searchPanel.id = "graph-local-search-panel";
  searchPanel.hidden = true;
  const header = el("div", "graph-panel-header");
  header.append(
    el("strong", "", graphText("settings")),
    button(
      graphText("close"),
      () => setOpen(false),
      "graph-button graph-close",
    ),
  );
  panel.append(header);
  const sections = new Map<string, HTMLElement>();
  for (const name of ["appearance", "forces"] as const) {
    const section = el("section", "graph-section");
    const title = el("h2", "graph-section-title");
    const icon = el("span", "material-symbol", name === "appearance" ? "palette" : "hub");
    icon.setAttribute("aria-hidden", "true");
    title.append(icon, el("span", "", graphText(name)));
    title.id = `graph-${name}-title`;
    section.setAttribute("aria-labelledby", title.id);
    const body = el("div", "graph-section-body");
    section.append(title, body);
    panel.append(section);
    sections.set(name, body);
  }
  const query = el("input", "graph-query");
  query.id = "graph-search-input";
  query.type = "search";
  query.placeholder = graphText("query");
  query.setAttribute("aria-label", graphText("query"));
  query.autocomplete = "off";
  query.spellcheck = false;
  query.oninput = () => {
    get().query = query.value;
    change("query");
  };
  const queryError = el("p", "graph-error");
  queryError.id = "graph-query-error";
  queryError.setAttribute("role", "status");
  query.setAttribute("aria-describedby", queryError.id);
  const help = el("details", "graph-help");
  help.append(el("summary", "", graphText("help")));
  const helpList = el("dl");
  for (const [syntax, key] of [
    ['path:"notes/项目"', "pathHelp"],
    ["file:.md", "fileHelp"],
    ["tag:work", "tagHelp"],
    ["line:(甲 乙)", "lineHelp"],
    ["section:(甲 乙)", "sectionHelp"],
    ["[status:done]", "propertyHelp"],
  ] as const) {
    helpList.append(el("dt", "", syntax), el("dd", "", graphText(key)));
  }
  help.append(helpList, el("p", "", graphText("helpText")));
  searchPanel.append(query, queryError, help);
  const fields = new Map<keyof GraphSettings, HTMLInputElement>();
  const arrowRow = el("label", "graph-switch-row");
  const arrows = button("", () => {
    get().arrows = !get().arrows;
    arrows.setAttribute("aria-checked", String(get().arrows));
    change("arrows");
  }, "material-switch graph-switch");
  arrows.id = "graph-arrows";
  arrows.setAttribute("role", "switch");
  arrows.setAttribute("aria-label", graphText("arrows"));
  for (const cls of ["switch-track", "switch-thumb"]) {
    const shape = el("span", cls);
    shape.setAttribute("aria-hidden", "true");
    arrows.append(shape);
  }
  arrows.onpointerdown = (event) => {
    if (event.button !== 0) return;
    arrows.setPointerCapture(event.pointerId);
    arrows.classList.add("is-pressed");
  };
  const releaseSwitch = () => arrows.classList.remove("is-pressed");
  arrows.onpointerup = releaseSwitch;
  arrows.onpointercancel = releaseSwitch;
  arrows.onlostpointercapture = releaseSwitch;
  arrows.onkeydown = (event) => {
    if (event.key === " " || event.key === "Enter") arrows.classList.add("is-pressed");
  };
  arrows.onkeyup = releaseSwitch;
  arrows.onblur = releaseSwitch;
  arrowRow.append(el("span", "", graphText("arrows")), arrows);
  sections.get("appearance")!.append(arrowRow);
  function updateSlider(range: HTMLInputElement) {
    const slider = range.closest<HTMLElement>(".graph-slider")!;
    slider.style.setProperty("--graph-progress",
      `${((range.valueAsNumber - Number(range.min)) / (Number(range.max) - Number(range.min))) * 100}%`);
    slider.querySelector(".graph-slider-value")!.textContent = range.value;
  }
  for (const [key, min, max, step] of [
    ["textFade", -1, 1, 0.05],
    ["nodeSize", 0.25, 3, 0.05],
    ["lineWidth", 0.25, 3, 0.05],
    ["centerForce", 0, 3, 0.05],
    ["repelForce", 0, 3, 0.05],
    ["linkForce", 0, 3, 0.05],
    ["linkDistance", 30, 400, 1],
  ] as const) {
    const row = el("div", "graph-slider-row");
    const label = el("label", "", graphText(key));
    label.htmlFor = `graph-${key}`;
    const range = el("input");
    range.type = "range";
    range.id = label.htmlFor;
    const slider = el("div", "graph-slider");
    const visual = el("div", "graph-slider-visual");
    visual.setAttribute("aria-hidden", "true");
    const activeTrack = el("span", "graph-slider-active");
    const inactiveTrack = el("span", "graph-slider-inactive");
    inactiveTrack.append(el("span", "graph-slider-end"));
    visual.append(activeTrack, inactiveTrack, el("span", "graph-slider-handle"), el("span", "graph-slider-value"));
    slider.append(visual, range);
    range.onpointerdown = (event) => {
      if (event.button !== 0) return;
      range.setPointerCapture(event.pointerId);
      slider.classList.add("is-dragging");
    };
    const releaseSlider = () => slider.classList.remove("is-dragging");
    range.onpointerup = releaseSlider;
    range.onpointercancel = releaseSlider;
    range.onlostpointercapture = releaseSlider;
    range.onblur = releaseSlider;
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.dataset.setting = key;
    range.oninput = () => {
      get()[key] = range.valueAsNumber;
      updateSlider(range);
      change(key);
    };
    row.append(label, slider);
    (key.endsWith("Force") || key === "linkDistance"
      ? sections.get("forces")!
      : sections.get("appearance")!
    ).append(row);
    fields.set(key, range);
  }
  const footer = el("div", "graph-panel-footer");
  const reset = button(graphText("reset"), actions.reset);
  reset.id = "graph-defaults";
  footer.append(reset, el("small", "graph-hint", graphText("storage")));
  panel.append(footer);
  const status = el("div", "graph-status");
  status.setAttribute("role", "status");
  const count = el("span");
  const error = el("span", "graph-error");
  const retry = button(graphText("retry"), actions.retry);
  retry.hidden = true;
  status.append(count, error, retry);
  toolbar.append(searchPanel);
  host.append(toolbar, panel, status);
  function setOpen(open: boolean) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      searchPanel.hidden = true;
      search.setAttribute("aria-expanded", "false");
      panel.querySelector<HTMLButtonElement>("button")?.focus();
    } else toggle.focus();
  }
  function setSearchOpen(open: boolean) {
    searchPanel.hidden = !open;
    search.setAttribute("aria-expanded", String(open));
    if (open) {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      query.focus();
    } else search.focus();
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (!searchPanel.hidden) {
      event.stopPropagation();
      setSearchOpen(false);
    } else if (!panel.hidden) {
      event.stopPropagation();
      setOpen(false);
    }
  };
  host.addEventListener("keydown", escape);
  disposers.push(() => host.removeEventListener("keydown", escape));
  function sync() {
    query.value = get().query;
    arrows.setAttribute("aria-checked", String(get().arrows));
    for (const [key, range] of fields) {
      range.value = String(get()[key]);
      updateSlider(range);
    }
    syncToggles();
  }
  function syncToggles() {
    for (const [key, shortcut] of shortcuts) {
      shortcut.setAttribute("aria-pressed", String(get()[key]));
    }
  }
  sync();
  return {
    sync,
    fullButton: full,
    setCount(n: number) {
      count.textContent = n ? `${n} ${graphText("count")}` : graphText("empty");
    },
    setError(message: string, retryable = false) {
      error.textContent = message;
      retry.hidden = !retryable;
    },
    queryError(message: string) {
      queryError.textContent = message;
      query.setAttribute("aria-invalid", String(!!message));
    },
    animationAvailable(available: boolean) {
      play.disabled = !available;
      play.setAttribute("data-tooltip", graphText(available ? "play" : "noDates"));
    },
    animation(state: "idle" | "playing") {
      play.setAttribute("aria-pressed", String(state === "playing"));
      play.querySelector(".material-symbol")!.textContent =
        state === "playing" ? "stop" : "play_arrow";
    },
    destroy() {
      disposers.forEach((d) => d());
      host.replaceChildren();
    },
  };
}
