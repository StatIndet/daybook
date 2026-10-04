import type { GraphSettings } from "./graph-settings";
import { createColorPicker } from "./graph-color";

const words = {
  settings: ["图谱设置", "Graph settings"],
  center: ["回到中心", "Recenter"],
  full: ["返回完整图谱", "Full graph"],
  close: ["关闭", "Close"],
  reset: ["恢复默认", "Restore defaults"],
  filters: ["筛选", "Filters"],
  groups: ["颜色组", "Color groups"],
  appearance: ["外观", "Display"],
  forces: ["力度", "Forces"],
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
  add: ["新建颜色组", "New color group"],
  groupQuery: ["输入查询规则…", "Enter a query…"],
  up: ["上移", "Move up"],
  down: ["下移", "Move down"],
  remove: ["删除", "Delete"],
  color: ["颜色", "Color"],
  play: ["播放动画", "Animate"],
  pause: ["暂停", "Pause"],
  resume: ["继续", "Resume"],
  stop: ["停止", "Stop"],
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
    "空格：同时满足 · OR：任一满足 · -：排除 · 引号：短语。颜色组使用相同规则，靠前的组优先。",
    "Space: AND · OR: either · -: exclude · quotes: phrase. Color groups use the same rules; first match wins.",
  ],
  pathHelp: ["路径", "Path"],
  fileHelp: ["文件名", "Filename"],
  tagHelp: ["标签及子标签", "Tag and descendants"],
  lineHelp: ["同一行", "Same line"],
  sectionHelp: ["同一章节", "Same section"],
  propertyHelp: ["公开属性", "Public property"],
  colorHint: [
    "空查询不着色；拖动滑块可实时预览。",
    "Empty queries do not color nodes. Changes preview immediately.",
  ],
  noDates: ["当前筛选没有可用于动画的日期", "No dated notes in this selection"],
  storage: ["设置保存在此浏览器中", "Settings saved in this browser"],
  day: ["按笔记日期 · 12 秒", "By note date · 12 seconds"],
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
    stop(): void;
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
  const toggle = button(graphText("settings"), () => setOpen(!!panel.hidden));
  toggle.id = "graph-settings-btn";
  toggle.setAttribute("aria-controls", panel.id);
  toggle.setAttribute("aria-expanded", "false");
  const center = button(graphText("center"), actions.center);
  center.id = "graph-reset";
  const full = button(graphText("full"), actions.full);
  full.hidden = !new URLSearchParams(location.search).has("node");
  toolbar.append(toggle, center, full);
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
  for (const name of ["filters", "groups", "appearance", "forces"] as const) {
    const details = el("details", "graph-section");
    details.open = name === "filters";
    details.append(el("summary", "", graphText(name)));
    const body = el("div", "graph-section-body");
    details.append(body);
    panel.append(details);
    sections.set(name, body);
  }
  const filter = sections.get("filters")!;
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
  filter.append(query, queryError, help);
  const fields = new Map<keyof GraphSettings, HTMLInputElement[]>();
  for (const [key, label, id] of [
    ["showTags", "tags", "graph-tags-btn"],
    ["showAttachments", "attachments", "graph-attachments-btn"],
    ["existingOnly", "existing", "graph-existing-btn"],
    ["showOrphans", "orphans", "graph-orphan-btn"],
    ["arrows", "arrows", "graph-arrows"],
  ] as const) {
    const row = el("label", "graph-switch-row");
    const input = el("input", "graph-switch");
    input.type = "checkbox";
    input.id = id;
    input.setAttribute("role", "switch");
    input.onchange = () => {
      get()[key] = input.checked;
      change(key);
    };
    row.append(el("span", "", graphText(label)), input);
    (key === "arrows" ? sections.get("appearance")! : filter).append(row);
    fields.set(key, [input]);
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
    const number = el("input", "graph-number");
    number.type = "number";
    number.setAttribute("aria-label", graphText(key));
    for (const input of [range, number]) {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.dataset.setting = key;
      input.oninput = () => {
        if (input.value === "" || !Number.isFinite(input.valueAsNumber)) return;
        const value = Math.max(min, Math.min(max, input.valueAsNumber));
        get()[key] = value;
        range.value = String(value);
        range.style.setProperty(
          "--graph-progress",
          `${((value - min) / (max - min)) * 100}%`,
        );
        if (input !== number) number.value = String(value);
        change(key);
      };
      input.onchange = () => {
        input.value = String(get()[key]);
      };
    }
    const top = el("div", "graph-slider-label");
    top.append(label, number);
    row.append(top, range);
    (key.endsWith("Force") || key === "linkDistance"
      ? sections.get("forces")!
      : sections.get("appearance")!
    ).append(row);
    fields.set(key, [range, number]);
  }
  const groupHost = el("div", "graph-groups");
  const groups = sections.get("groups")!;
  groups.append(
    el("p", "graph-hint", graphText("colorHint")),
    groupHost,
    button(graphText("add"), () => {
      get().groups.push({
        id: crypto.randomUUID?.() || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        query: "",
        color: ["#E05252", "#5B8DEF", "#4F9569", "#A270C8"][
          get().groups.length % 4
        ]!,
      });
      renderGroups();
      change("groups");
    }),
  );
  let pickers: (() => void)[] = [];
  const groupErrors = new Map<string, HTMLElement>();
  function renderGroups() {
    pickers.forEach((d) => d());
    pickers = [];
    groupHost.replaceChildren();
    groupErrors.clear();
    get().groups.forEach((group, index) => {
      const row = el("div", "graph-group");
      row.dataset.groupId = group.id;
      const input = el("input", "graph-query");
      input.value = group.query;
      input.placeholder = graphText("groupQuery");
      input.setAttribute("aria-label", `${graphText("groups")} ${index + 1}`);
      input.oninput = () => {
        group.query = input.value;
        change("groups");
      };
      const tools = el("div", "graph-group-tools");
      const color = button(
        `${graphText("color")} ${group.color}`,
        () => {
          pickerHost.hidden = !pickerHost.hidden;
          color.setAttribute("aria-expanded", String(!pickerHost.hidden));
        },
        "graph-swatch",
      );
      color.style.setProperty("--swatch", group.color);
      color.setAttribute("aria-expanded", "false");
      const pickerHost = el("div");
      pickerHost.hidden = true;
      const picker = createColorPicker(pickerHost, group.color, (hex) => {
        group.color = hex;
        color.style.setProperty("--swatch", hex);
        color.textContent = `${graphText("color")} ${hex}`;
        change("groups");
      });
      pickers.push(() => picker.destroy());
      const up = button("↑", () => move(-1));
      up.setAttribute("aria-label", graphText("up"));
      up.disabled = index === 0;
      const down = button("↓", () => move(1));
      down.setAttribute("aria-label", graphText("down"));
      down.disabled = index === get().groups.length - 1;
      function move(delta: number) {
        const list = get().groups;
        [list[index], list[index + delta]] = [
          list[index + delta]!,
          list[index]!,
        ];
        renderGroups();
        change("groups");
        groupHost.children[index + delta]
          ?.querySelector<HTMLInputElement>(".graph-query")
          ?.focus();
      }
      tools.append(
        color,
        up,
        down,
        button(graphText("remove"), () => {
          get().groups.splice(index, 1);
          renderGroups();
          change("groups");
          const adjacent =
            groupHost.children[Math.min(index, get().groups.length - 1)];
          (
            adjacent?.querySelector<HTMLInputElement>(".graph-query") ||
            groups.querySelector<HTMLButtonElement>(":scope > button")
          )?.focus();
        }),
      );
      const error = el("p", "graph-error");
      error.id = `graph-group-error-${index}`;
      error.setAttribute("role", "status");
      input.setAttribute("aria-describedby", error.id);
      groupErrors.set(group.id, error);
      row.append(input, tools, pickerHost, error);
      groupHost.append(row);
    });
  }
  const animation = el("div", "graph-animation");
  const play = button(graphText("play"), actions.play);
  play.id = "graph-play";
  const stop = button(graphText("stop"), actions.stop);
  stop.id = "graph-stop";
  stop.disabled = true;
  const progress = el("progress");
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute("aria-label", graphText("play"));
  const animationHint = el("p", "graph-hint", graphText("day"));
  animation.append(animationHint, play, stop, progress);
  sections.get("appearance")!.append(animation);
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
  host.append(toolbar, panel, status);
  function setOpen(open: boolean) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector<HTMLButtonElement>("button")?.focus();
    else toggle.focus();
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.stopPropagation();
      setOpen(false);
    }
  };
  host.addEventListener("keydown", escape);
  disposers.push(() => host.removeEventListener("keydown", escape));
  function sync() {
    query.value = get().query;
    for (const [key, inputs] of fields) {
      for (const input of inputs) {
        if (input.type === "checkbox") input.checked = get()[key] as boolean;
        else {
          input.value = String(get()[key]);
          if (input.type === "range")
            input.style.setProperty(
              "--graph-progress",
              `${((input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
            );
        }
      }
    }
    renderGroups();
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
    groupError(id: string, message: string) {
      const e = groupErrors.get(id);
      if (e) {
        e.textContent = message;
        e.parentElement
          ?.querySelector("input")
          ?.setAttribute("aria-invalid", String(!!message));
      }
    },
    animationAvailable(available: boolean) {
      play.disabled = !available;
      animationHint.textContent = graphText(available ? "day" : "noDates");
    },
    animation(state: "idle" | "playing" | "paused", value: number) {
      play.textContent = graphText(
        state === "playing" ? "pause" : state === "paused" ? "resume" : "play",
      );
      stop.disabled = state === "idle";
      progress.value = value;
    },
    destroy() {
      pickers.forEach((d) => d());
      disposers.forEach((d) => d());
      host.replaceChildren();
    },
  };
}
