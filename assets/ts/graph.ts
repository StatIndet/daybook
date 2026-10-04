import {
  compileQuery,
  type CompiledQuery,
  type SearchDocument,
} from "./graph-query";
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  settingsStorageKey,
  type GraphSettings,
} from "./graph-settings";
import { createGraphPanel, graphText, type Panel } from "./graph-panel";

export interface TagNode {
  id: string;
  title: string;
}
export interface AttachmentNode {
  id: string;
  title: string;
  url: string;
  path?: string;
  file?: string;
}
interface RawNode {
  id: string;
  title: string;
  url?: string;
  path?: string;
  file?: string;
  date?: string;
  exists: boolean;
  degree: number;
  tags?: TagNode[];
  attachments?: AttachmentNode[];
  isTag?: boolean;
  isAttachment?: boolean;
}
interface GraphNode extends RawNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
}
interface RawLink {
  source: string;
  target: string;
  type?: string;
}
interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  forward: boolean;
  reverse: boolean;
  type?: string;
}
interface GraphData {
  version?: number;
  nodes: RawNode[];
  links: RawLink[];
  meta?: { layoutDiameter?: number; nodeCount?: number; linkCount?: number };
}
const ANIMATION_DURATION_MS = 8000;
const endpoint = (n: string | GraphNode) => (typeof n === "string" ? n : n.id);

(() => {
  let container: HTMLElement | null = null,
    controls: HTMLElement | null = null,
    panel: Panel | null = null;
  let raw: GraphData = { nodes: [], links: [] };
  let settings = defaultSettings(),
    storageKey = "",
    basePath = "";
  let activeQuery: CompiledQuery = compileQuery("");
  let index: Map<string, SearchDocument> | null = null;
  let indexPromise: Promise<void> | null = null;
  let abort: AbortController | null = null,
    generation = 0,
    queryRevision = 0;
  let svg: any = null,
    g: any = null,
    simulation: any = null,
    zoom: any = null,
    nodeSelection: any = null,
    linkSelection: any = null;
  let resize: ResizeObserver | null = null,
    inputTimer = 0;
  const cache = new Map<string, GraphNode>();
  let fullNodes: RawNode[] = [],
    fullLinks: GraphLink[] = [],
    currentNodes: GraphNode[] = [],
    currentLinks: GraphLink[] = [];
  let animation: "idle" | "playing" | "paused" = "idle",
    frame = 0,
    elapsed = 0,
    started = 0,
    days: string[] = [],
    lastBatch = -1;
  const reduce = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const radius = (degree: number) =>
    (5 + Math.sqrt(degree) * 1.5) * settings.nodeSize;
  const dimensions = () => ({
    w: container?.clientWidth || 800,
    h: container?.clientHeight || 600,
  });
  const documentFor = (n: RawNode): SearchDocument => ({
    ...index?.get(n.id),
    id: n.id,
    title: n.title,
    file: n.file || n.title,
    path: n.path || n.id,
    tags: n.isTag ? [n.title.replace(/^#/, "")] : n.tags?.map((t) => t.title),
  });

  async function init(root: Document | HTMLElement = document) {
    destroy();
    container = root.querySelector("#graph-container");
    if (!container) return;
    controls = root.querySelector("#graph-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "graph-controls";
      container.before(controls);
    }
    const epoch = generation;
    abort = new AbortController();
    basePath = location.pathname.replace(/\/graph\/?$/, "");
    storageKey = settingsStorageKey(location.pathname);
    settings = loadSettings(storageKey);
    panel = createGraphPanel(controls, () => settings, changed, {
      center: recenter,
      reset: restore,
      full: fullGraph,
      play: toggleAnimation,
      stop: () => stopAnimation(true),
      retry: () => {
        if (raw.nodes.length) void applyQuery();
        else void init(root);
      },
    });
    panel.setError(graphText("loading"));
    try {
      const response = await fetch(`${basePath}/graph.json`, {
        signal: abort.signal,
      });
      if (!response.ok) throw Error("graph");
      const data = (await response.json()) as GraphData;
      if (epoch !== generation) return;
      if (!Array.isArray(data.nodes) || !Array.isArray(data.links))
        throw Error("graph");
      raw = data;
      activeQuery = compileQuery("");
      panel?.setError("");
      recompute();
      await applyQuery();
      if (epoch !== generation) return;
      resize = new ResizeObserver(() => {
        const { w, h } = dimensions();
        svg?.attr("viewBox", [0, 0, w, h]);
        if (simulation) {
          simulation.force("x").x(w / 2);
          simulation.force("y").y(h / 2);
        }
      });
      resize.observe(container!);
      window.addEventListener("popstate", routeChanged);
      document.addEventListener("daybook:lang-change", languageChanged);
    } catch (error) {
      if (epoch === generation && (error as Error).name !== "AbortError")
        panel?.setError(graphText("graphError"), true);
    }
  }
  function destroy() {
    generation++;
    queryRevision++;
    abort?.abort();
    abort = null;
    window.clearTimeout(inputTimer);
    cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("popstate", routeChanged);
    document.removeEventListener("daybook:lang-change", languageChanged);
    resize?.disconnect();
    resize = null;
    panel?.destroy();
    panel = null;
    simulation?.on("tick", null).stop();
    simulation = null;
    if (svg) {
      window.d3.select(window).on(".drag", null).on(".zoom", null);
      window.d3.dragEnable(window);
    }
    svg?.interrupt();
    svg?.selectAll("*").interrupt();
    if (container) {
      container.replaceChildren();
      container.classList.remove("graph-dimmed");
    }
    container = null;
    controls = null;
    svg = null;
    g = null;
    zoom = null;
    nodeSelection = null;
    linkSelection = null;
    cache.clear();
    raw = { nodes: [], links: [] };
    fullNodes = [];
    fullLinks = [];
    currentNodes = [];
    currentLinks = [];
    index = null;
    indexPromise = null;
    animation = "idle";
    elapsed = 0;
    days = [];
    lastBatch = -1;
    appliedQuery = "";
    (window as any).__graphNodes = null;
  }
  function languageChanged() {
    if (!controls) return;
    panel?.destroy();
    panel = createGraphPanel(controls, () => settings, changed, {
      center: recenter,
      reset: restore,
      full: fullGraph,
      play: toggleAnimation,
      stop: () => stopAnimation(true),
      retry: () => void applyQuery(),
    });
    panel.setCount(currentNodes.length);
    panel.animation(animation, elapsed / ANIMATION_DURATION_MS);
    void applyQuery();
  }
  function routeChanged() {
    stopAnimation(false);
    recompute();
    if (panel)
      panel.fullButton.hidden = !new URLSearchParams(location.search).has(
        "node",
      );
  }
  function fullGraph() {
    const url = new URL(location.href);
    url.searchParams.delete("node");
    url.searchParams.delete("depth");
    history.pushState({}, "", url);
    routeChanged();
    recenter();
  }
  function recenter() {
    if (!svg || !zoom) return;
    svg.interrupt();
    if (reduce()) svg.call(zoom.transform, defaultTransform());
    else
      svg.transition().duration(500).call(zoom.transform, defaultTransform());
  }
  function defaultTransform() {
    const { w, h } = dimensions();
    const scale = Math.max(
      0.1,
      Math.min(
        1.8,
        (Math.min(w, h) * 0.82) / ((raw.meta?.layoutDiameter || 10) * 120),
      ),
    );
    return window.d3.zoomIdentity
      .translate(w / 2, h / 2)
      .scale(scale)
      .translate(-w / 2, -h / 2);
  }
  function restore() {
    stopAnimation(false);
    window.clearTimeout(inputTimer);
    queryRevision++;
    settings = defaultSettings();
    activeQuery = compileQuery("");
    appliedQuery = "";
    saveSettings(storageKey, settings);
    panel?.sync();
    panel?.queryError("");
    panel?.setError("");
    recompute();
    recenter();
  }
  function changed(key: keyof GraphSettings) {
    saveSettings(storageKey, settings);
    if (key === "query") {
      queryRevision++;
      stopAnimation(true);
      window.clearTimeout(inputTimer);
      inputTimer = window.setTimeout(() => void applyQuery(), 180);
      return;
    }
    if (
      ["showTags", "showAttachments", "showOrphans", "existingOnly"].includes(
        key,
      )
    ) {
      stopAnimation(false);
      recompute();
      return;
    }
    if (
      ["centerForce", "repelForce", "linkForce", "linkDistance"].includes(key)
    ) {
      updateForces();
      return;
    }
    updateAppearance();
    if (key === "nodeSize") {
      simulation?.force("collide").radius((n: GraphNode) => n.radius + 6);
      reheat(0.12);
    }
  }
  async function loadIndex() {
    if (index) return;
    if (indexPromise) return indexPromise;
    const epoch = generation;
    const signal = abort?.signal;
    const promise = (async () => {
      const res = await fetch(`${basePath}/graph-search.json`, { signal });
      if (!res.ok) throw Error("index");
      const data = await res.json();
      if (data.version !== 1 || !Array.isArray(data.documents))
        throw Error("index");
      if (epoch === generation)
        index = new Map(data.documents.map((d: SearchDocument) => [d.id, d]));
    })();
    indexPromise = promise;
    try {
      await promise;
    } finally {
      if (epoch === generation) indexPromise = null;
    }
  }
  async function applyQuery() {
    const revision = ++queryRevision,
      epoch = generation;
    let query: CompiledQuery;
    try {
      query = compileQuery(settings.query);
      panel?.queryError("");
    } catch (error) {
      panel?.queryError((error as Error).message);
      return;
    }
    if (query.needsIndex && !index) {
      panel?.setError(graphText("loading"));
      try {
        await loadIndex();
      } catch {
        if (epoch === generation && revision === queryRevision)
          panel?.setError(graphText("loadError"), true);
        return;
      }
    }
    if (epoch !== generation || revision !== queryRevision) return;
    panel?.setError("");
    activeQuery = query;
    if (settings.query !== appliedQuery) {
      appliedQuery = settings.query;
      stopAnimation(false);
      recompute();
    }
  }
  let appliedQuery = "";
  function localIDs(): Set<string> | null {
    const params = new URLSearchParams(location.search),
      center = params.get("node");
    if (!center || !raw.nodes.some((n) => n.id === center)) return null;
    const depth = Math.max(
      1,
      Math.min(
        raw.nodes.length,
        Number.parseInt(params.get("depth") || "1", 10) || 1,
      ),
    );
    const adj = new Map<string, Set<string>>();
    for (const l of raw.links) {
      if (!adj.has(l.source)) adj.set(l.source, new Set());
      if (!adj.has(l.target)) adj.set(l.target, new Set());
      adj.get(l.source)!.add(l.target);
      adj.get(l.target)!.add(l.source);
    }
    const ids = new Set([center]);
    let frontier = [center];
    for (let i = 0; i < depth; i++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const neighbor of adj.get(id) || [])
          if (!ids.has(neighbor)) {
            ids.add(neighbor);
            next.push(neighbor);
          }
      frontier = next;
      if (!next.length) break;
    }
    return ids;
  }
  function recompute() {
    const local = localIDs();
    const eligible = raw.nodes.filter(
      (n) =>
        (!settings.existingOnly || n.exists) && (!local || local.has(n.id)),
    );
    const visible = new Map<string, RawNode>();
    for (const n of eligible)
      if (activeQuery.matches(documentFor(n))) visible.set(n.id, n);
    const extra: RawLink[] = [];
    for (const n of eligible) {
      const matched = visible.has(n.id);
      if (settings.showTags && matched)
        for (const t of n.tags || []) {
          visible.set(t.id, {
            ...t,
            title: "#" + t.title,
            exists: true,
            degree: 0,
            isTag: true,
          });
          extra.push({ source: n.id, target: t.id, type: "tag" });
        }
      if (settings.showAttachments)
        for (const a of n.attachments || []) {
          const att: RawNode = {
            ...a,
            exists: true,
            degree: 0,
            isAttachment: true,
          };
          if (matched || activeQuery.matches(documentFor(att)))
            visible.set(a.id, att);
          if (matched)
            extra.push({ source: n.id, target: a.id, type: "attachment" });
        }
    }
    const pairs = new Map<string, GraphLink>();
    for (const l of [...raw.links, ...extra]) {
      if (
        l.source === l.target ||
        !visible.has(l.source) ||
        !visible.has(l.target)
      )
        continue;
      const [a, b] = [l.source, l.target].sort() as [string, string];
      const key = JSON.stringify([a, b]);
      let edge = pairs.get(key);
      if (!edge) {
        edge = {
          source: a,
          target: b,
          forward: false,
          reverse: false,
          type: l.type || "wikilink",
        };
        pairs.set(key, edge);
      }
      if (l.source === a) edge.forward = true;
      else edge.reverse = true;
    }
    const degrees = new Map<string, number>();
    for (const l of pairs.values()) {
      degrees.set(
        endpoint(l.source),
        (degrees.get(endpoint(l.source)) || 0) + 1,
      );
      degrees.set(
        endpoint(l.target),
        (degrees.get(endpoint(l.target)) || 0) + 1,
      );
    }
    fullNodes = [...visible.values()]
      .filter((n) => settings.showOrphans || (degrees.get(n.id) || 0) > 0)
      .map((n) => ({ ...n, degree: degrees.get(n.id) || 0 }));
    fullLinks = [...pairs.values()];
    panel?.animationAvailable(fullNodes.some((n) => !!n.date));
    showGraph(fullNodes, fullLinks, 0.12);
  }
  function showGraph(rawNodes: RawNode[], links: GraphLink[], alpha = 0.12) {
    if (!container) return;
    const { w, h } = dimensions();
    const initialRadius = Math.max(50, Math.sqrt(rawNodes.length) * 15);
    currentNodes = rawNodes.map((n, i) => {
      let cached = cache.get(n.id);
      if (!cached) {
        const angle = (i * Math.PI * 2) / Math.max(1, rawNodes.length);
        cached = {
          ...n,
          radius: radius(n.degree),
          x: w / 2 + Math.cos(angle) * initialRadius,
          y: h / 2 + Math.sin(angle) * initialRadius,
        };
        cache.set(n.id, cached);
      }
      Object.assign(cached, n, { radius: radius(n.degree) });
      return cached;
    });
    const ids = new Set(currentNodes.map((n) => n.id));
    currentLinks = links
      .filter((l) => ids.has(endpoint(l.source)) && ids.has(endpoint(l.target)))
      .map((l) => ({
        ...l,
        source: endpoint(l.source),
        target: endpoint(l.target),
      }));
    for (const [id, n] of cache)
      if (!ids.has(id)) {
        n.vx = 0;
        n.vy = 0;
        n.fx = null;
        n.fy = null;
      }
    draw(alpha);
    panel?.setCount(currentNodes.length);
  }
  function draw(alpha: number) {
    const d3 = window.d3;
    const { w, h } = dimensions();
    if (!svg) {
      svg = d3
        .select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, w, h]);
      const defs = svg.append("defs");
      for (const [id, path, ref] of [
        ["end", "M0,-3L6,0L0,3", 6],
        ["start", "M6,-3L0,0L6,3", 0],
      ])
        defs
          .append("marker")
          .attr("id", `graph-arrow-${id}`)
          .attr("viewBox", "0 -4 8 8")
          .attr("markerWidth", 8)
          .attr("markerHeight", 8)
          .attr("refX", ref)
          .attr("refY", 0)
          .attr("orient", "auto")
          .attr("markerUnits", "userSpaceOnUse")
          .append("path")
          .attr("d", path)
          .attr("class", "graph-arrow");
      g = svg.append("g");
      g.append("g").attr("class", "graph-links");
      g.append("g").attr("class", "graph-nodes");
      zoom = d3
        .zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", (e: any) => {
          g.attr("transform", e.transform);
          updateLabels();
        });
      svg.call(zoom);
      svg.call(zoom.transform, defaultTransform());
    }
    container?.classList.remove("graph-dimmed");
    const initialLayout = !simulation;
    if (!simulation) {
      simulation = d3
        .forceSimulation(currentNodes)
        .alpha(1)
        .force(
          "link",
          d3.forceLink([]).id((n: GraphNode) => n.id),
        )
        .force("charge", d3.forceManyBody())
        .force("x", d3.forceX(w / 2))
        .force("y", d3.forceY(h / 2))
        .force(
          "collide",
          d3.forceCollide().radius((n: GraphNode) => n.radius + 6),
        );
    }
    simulation.force("link").links([]);
    simulation.nodes(currentNodes);
    simulation.force("link").links(currentLinks);
    updateForces(false);
    linkSelection = g
      .select(".graph-links")
      .selectAll("line")
      .data(currentLinks, (l: GraphLink) =>
        JSON.stringify([endpoint(l.source), endpoint(l.target)]),
      )
      .join("line")
      .attr("class", "graph-link");
    nodeSelection = g
      .select(".graph-nodes")
      .selectAll("g")
      .data(currentNodes, (n: GraphNode) => n.id)
      .join(
        (enter: any) => {
          const node = enter.append("g");
          node.append("circle");
          node.append("text");
          return node;
        },
        (update: any) => update,
        (exit: any) => exit.remove(),
      )
      .on("mouseover", (_: any, n: GraphNode) => hover(n.id))
      .on("mouseout", () => hover(null))
      .on("click", (e: any, n: GraphNode) => {
        if (e.defaultPrevented || !n.url) return;
        if (n.isAttachment) window.open(n.url, "_blank", "noopener");
        else if (window.daybookNavigateTo) window.daybookNavigateTo(n.url);
        else location.href = n.url;
      })
      .call(
        d3
          .drag()
          .on("start", (e: any, n: GraphNode) => {
            if (!simulation) return;
            if (!e.active && !reduce()) simulation.alphaTarget(0.3).restart();
            n.fx = n.x;
            n.fy = n.y;
          })
          .on("drag", (e: any, n: GraphNode) => {
            if (!simulation) return;
            n.x = n.fx = e.x;
            n.y = n.fy = e.y;
            tick();
          })
          .on("end", (e: any, n: GraphNode) => {
            if (!simulation) return;
            if (!e.active) simulation.alphaTarget(0);
            n.fx = null;
            n.fy = null;
            hover(null);
          }),
      );
    const center = new URLSearchParams(location.search).get("node");
    nodeSelection
      .select("circle")
      .attr(
        "class",
        (n: GraphNode) =>
          `graph-node${n.isTag ? " is-tag" : ""}${n.isAttachment ? " is-attachment" : ""}${!n.exists ? " is-missing" : ""}${n.id === center ? " is-center" : ""}`,
      );
    nodeSelection
      .select("text")
      .attr("class", "graph-label")
      .attr("text-anchor", "middle")
      .text((n: GraphNode) => n.title);
    (window as any).__graphNodes = nodeSelection;
    simulation.on("tick", tick);
    updateAppearance();
    if (reduce()) {
      simulation.stop();
      if (initialLayout) simulation.alpha(1).tick(100);
      tick();
    } else reheat(alpha);
  }
  function tick() {
    if (!linkSelection) return;
    linkSelection.each(function (this: SVGLineElement, l: GraphLink) {
      const s = l.source as GraphNode,
        t = l.target as GraphNode;
      const dx = (t.x || 0) - (s.x || 0),
        dy = (t.y || 0) - (s.y || 0),
        length = Math.hypot(dx, dy) || 1;
      const a = Math.min(length / 2, s.radius + 2),
        b = Math.min(length / 2, t.radius + 2);
      this.setAttribute("x1", String((s.x || 0) + (dx * a) / length));
      this.setAttribute("y1", String((s.y || 0) + (dy * a) / length));
      this.setAttribute("x2", String((t.x || 0) - (dx * b) / length));
      this.setAttribute("y2", String((t.y || 0) - (dy * b) / length));
    });
    nodeSelection.attr(
      "transform",
      (n: GraphNode) => `translate(${n.fx ?? n.x},${n.fy ?? n.y})`,
    );
  }
  function reheat(alpha: number) {
    if (!simulation) return;
    if (reduce()) {
      simulation.stop();
      tick();
    } else simulation.alpha(Math.max(simulation.alpha(), alpha)).restart();
  }
  function updateForces(restart = true) {
    if (!simulation) return;
    const counts = new Map<string, number>();
    for (const l of currentLinks)
      for (const n of [l.source, l.target])
        counts.set(endpoint(n), (counts.get(endpoint(n)) || 0) + 1);
    simulation
      .force("link")
      .distance(settings.linkDistance)
      .strength(
        (l: GraphLink) =>
          settings.linkForce /
          Math.max(
            1,
            Math.min(
              counts.get(endpoint(l.source)) || 1,
              counts.get(endpoint(l.target)) || 1,
            ),
          ),
      );
    simulation.force("charge").strength(-280 * settings.repelForce);
    simulation.force("x").strength(0.05 * settings.centerForce);
    simulation.force("y").strength(0.05 * settings.centerForce);
    if (restart) {
      if (reduce()) {
        simulation.alpha(1).stop().tick(100);
        tick();
      } else reheat(0.3);
    }
  }
  function updateAppearance() {
    if (!nodeSelection) return;
    for (const n of currentNodes) n.radius = radius(n.degree);
    nodeSelection.select("circle").attr("r", (n: GraphNode) => n.radius);
    nodeSelection.select("text").attr("dy", (n: GraphNode) => n.radius + 12);
    linkSelection
      .attr("stroke-width", settings.lineWidth)
      .attr("marker-end", (l: GraphLink) =>
        settings.arrows && l.type === "wikilink" && l.forward
          ? "url(#graph-arrow-end)"
          : null,
      )
      .attr("marker-start", (l: GraphLink) =>
        settings.arrows && l.type === "wikilink" && l.reverse
          ? "url(#graph-arrow-start)"
          : null,
      );
    updateLabels();
    tick();
  }
  function updateLabels() {
    if (!svg || !nodeSelection) return;
    const relative =
      window.d3.zoomTransform(svg.node()).k / defaultTransform().k;
    const threshold = 0.8 + settings.textFade * 0.6;
    const important = Math.max(
      3,
      (((raw.meta?.linkCount || 1) * 2) /
        Math.max(1, raw.meta?.nodeCount || 1)) *
        1.5,
    );
    nodeSelection
      .select("text")
      .style("opacity", function (this: Element, n: GraphNode) {
        if (this.classList.contains("is-highlight")) return 1;
        return relative >= threshold
          ? 1
          : relative >= threshold * 0.6875 && n.degree >= important
            ? 1
            : 0;
      });
  }
  function hover(id: string | null) {
    if (!nodeSelection) return;
    container?.classList.toggle("graph-dimmed", id !== null);
    const neighbors = new Set<string>();
    if (id) {
      neighbors.add(id);
      for (const l of currentLinks) {
        if (endpoint(l.source) === id) neighbors.add(endpoint(l.target));
        if (endpoint(l.target) === id) neighbors.add(endpoint(l.source));
      }
    }
    nodeSelection
      .selectAll("circle,text")
      .classed("is-highlight", (n: GraphNode) => neighbors.has(n.id))
      .classed("is-hovered", (n: GraphNode) => n.id === id);
    linkSelection.classed(
      "is-highlight",
      (l: GraphLink) => endpoint(l.source) === id || endpoint(l.target) === id,
    );
    updateLabels();
  }
  function stopAnimation(restoreGraph: boolean) {
    const wasActive = animation !== "idle";
    cancelAnimationFrame(frame);
    frame = 0;
    animation = "idle";
    elapsed = 0;
    lastBatch = -1;
    panel?.animation("idle", 0);
    if (restoreGraph && wasActive) showGraph(fullNodes, fullLinks);
  }
  function toggleAnimation() {
    if (animation === "playing") {
      elapsed = Math.min(ANIMATION_DURATION_MS, performance.now() - started);
      animation = "paused";
      cancelAnimationFrame(frame);
      panel?.animation(animation, elapsed / ANIMATION_DURATION_MS);
      return;
    }
    if (animation === "idle") {
      days = [
        ...new Set(
          fullNodes.filter((n) => n.date).map((n) => n.date!.slice(0, 10)),
        ),
      ].sort();
      if (!days.length) return;
      elapsed = 0;
      lastBatch = -1;
    }
    animation = "playing";
    started = performance.now() - elapsed;
    animationFrame();
  }
  function animationFrame() {
    if (animation !== "playing") return;
    elapsed = Math.min(ANIMATION_DURATION_MS, performance.now() - started);
    const batch = Math.min(
      days.length - 1,
      Math.floor((elapsed / ANIMATION_DURATION_MS) * days.length),
    );
    if (batch !== lastBatch) {
      lastBatch = batch;
      const day = days[batch]!;
      const ids = new Set(
        fullNodes
          .filter((n) => n.date && n.date.slice(0, 10) <= day)
          .map((n) => n.id),
      );
      const dated = new Set(ids);
      const byID = new Map(fullNodes.map((n) => [n.id, n]));
      for (const l of fullLinks) {
        const a = endpoint(l.source),
          b = endpoint(l.target);
        if (dated.has(a) && !byID.get(b)?.date) ids.add(b);
        if (dated.has(b) && !byID.get(a)?.date) ids.add(a);
      }
      showGraph(
        fullNodes.filter((n) => ids.has(n.id)),
        fullLinks,
      );
    }
    panel?.animation(animation, elapsed / ANIMATION_DURATION_MS);
    if (elapsed >= ANIMATION_DURATION_MS) {
      animation = "idle";
      showGraph(fullNodes, fullLinks);
      panel?.animation("idle", 1);
      frame = 0;
    } else frame = requestAnimationFrame(animationFrame);
  }
  window.DaybookGraph = { init, destroy };
})();
