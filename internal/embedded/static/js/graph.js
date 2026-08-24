// assets/ts/graph.ts
(function() {
  let container = null;
  let searchInput = null;
  let searchBtn = null;
  let actionsHorizontal = null;
  let orphanBtn = null;
  let resetBtn = null;
  let tagsBtn = null;
  let attachmentsBtn = null;
  let showTags = false;
  let showAttachments = false;
  let showOrphans = true;
  let rawNodes = [];
  let rawLinks = [];
  let graphMeta = null;
  let adjacencyMap = /* @__PURE__ */ new Map();
  let simulation = null;
  let zoomBehavior = null;
  let svg = null;
  let g = null;
  let isDragging = false;
  async function init(root) {
    if (!root) root = document;
    container = root.querySelector("#graph-container");
    searchInput = root.querySelector("#graph-search-input");
    searchBtn = root.querySelector("#graph-search-btn");
    tagsBtn = root.querySelector("#graph-tags-btn");
    attachmentsBtn = root.querySelector("#graph-attachments-btn");
    actionsHorizontal = root.querySelector(".graph-actions-horizontal");
    orphanBtn = root.querySelector("#graph-orphan-btn");
    resetBtn = root.querySelector("#graph-reset");
    if (!container) return;
    try {
      const basePath = window.location.pathname.replace(/\/graph\/?$/, "");
      const res = await fetch(`${basePath}/graph.json`);
      const data = await res.json();
      rawNodes = data.nodes || [];
      rawLinks = data.links || [];
      graphMeta = data.meta || null;
      buildAdjacencyMap(rawNodes, rawLinks);
      render();
      setupEventListeners();
    } catch (err) {
      console.error("Failed to load graph data:", err);
    }
  }
  function destroy() {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    if (container) {
      container.innerHTML = "";
    }
    rawNodes = [];
    rawLinks = [];
    graphMeta = null;
    adjacencyMap.clear();
    window.__graphNodes = null;
  }
  function buildAdjacencyMap(nodes, links) {
    adjacencyMap.clear();
    nodes.forEach((n) => {
      adjacencyMap.set(n.id, /* @__PURE__ */ new Set());
    });
    links.forEach((l) => {
      if (adjacencyMap.has(l.source) && adjacencyMap.has(l.target)) {
        adjacencyMap.get(l.source).add(l.target);
        adjacencyMap.get(l.target).add(l.source);
      }
    });
  }
  function getLocalGraph(centerNodeId, depth) {
    const visited = /* @__PURE__ */ new Set();
    const queue = [{ id: centerNodeId, d: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (current.d < depth) {
        const neighbors = adjacencyMap.get(current.id) || /* @__PURE__ */ new Set();
        for (const n of Array.from(neighbors)) {
          if (!visited.has(n)) {
            queue.push({ id: n, d: current.d + 1 });
          }
        }
      }
    }
    return visited;
  }
  function getRadius(degree) {
    const baseR = 5;
    return baseR + Math.sqrt(degree) * 1.5;
  }
  function getDefaultGraphTransform(width, height) {
    const d3 = window.d3;
    let logicalDiameter = 10;
    if (graphMeta && graphMeta.layoutDiameter) {
      logicalDiameter = graphMeta.layoutDiameter;
    }
    const logicalPixels = logicalDiameter * 120;
    const GRAPH_VIEW_PADDING = 0.18;
    const paddingMultiplier = 1 - GRAPH_VIEW_PADDING;
    const availableSize = Math.min(width, height) * paddingMultiplier;
    let fitScale = availableSize / logicalPixels;
    if (fitScale > 1.8) fitScale = 1.8;
    if (fitScale < 0.1) fitScale = 0.1;
    return {
      transform: d3.zoomIdentity.translate(width / 2, height / 2).scale(fitScale).translate(-width / 2, -height / 2),
      scale: fitScale
    };
  }
  function render(initialAlpha = 1) {
    let currentPositions = /* @__PURE__ */ new Map();
    let currentTransform = null;
    const graphNodesSelection = window.__graphNodes;
    if (graphNodesSelection) {
      graphNodesSelection.each(function(d) {
        currentPositions.set(d.id, { x: d.x, y: d.y, vx: d.vx, vy: d.vy });
      });
      if (svg && svg.node()) {
        currentTransform = window.window.d3.zoomTransform(svg.node());
      }
    }
    const urlParams = new URLSearchParams(window.location.search);
    const centerNodeId = urlParams.get("node");
    let depth = parseInt(urlParams.get("depth") || "1", 10);
    if (isNaN(depth) || depth < 1) depth = 1;
    let filteredNodeIds = null;
    if (centerNodeId && adjacencyMap.has(centerNodeId)) {
      filteredNodeIds = getLocalGraph(centerNodeId, depth);
    }
    const cx = (container.clientWidth || 800) / 2;
    const cy = (container.clientHeight || 600) / 2;
    let filteredNodes = rawNodes.filter((n) => n.exists).filter((n) => showOrphans || n.degree > 0).filter((n) => !filteredNodeIds || filteredNodeIds.has(n.id));
    const initialRadius = Math.max(50, Math.sqrt(filteredNodes.length) * 15);
    let nodes = filteredNodes.map((n, i) => {
      const existing = currentPositions.get(n.id);
      if (existing && existing.x !== void 0 && existing.y !== void 0) {
        return {
          ...n,
          radius: getRadius(n.degree),
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy
        };
      }
      const angle = i * Math.PI * 2 / filteredNodes.length;
      const r = initialRadius * (0.5 + Math.random() * 0.5);
      return {
        ...n,
        radius: getRadius(n.degree),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r
      };
    });
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let links = rawLinks.filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target)).map((l) => ({ ...l }));
    if (showTags) {
      const tagNodesMap = /* @__PURE__ */ new Map();
      const newLinks = [];
      nodes.forEach((n) => {
        if (n.tags && n.tags.length > 0) {
          n.tags.forEach((tagObj) => {
            const tagId = tagObj.id;
            if (!tagNodesMap.has(tagId)) {
              const angle = Math.random() * Math.PI * 2;
              const offset = 20;
              tagNodesMap.set(tagId, {
                id: tagId,
                title: "#" + tagObj.title,
                isTag: true,
                exists: true,
                degree: 1,
                radius: getRadius(1),
                x: (n.x || 0) + Math.cos(angle) * offset,
                y: (n.y || 0) + Math.sin(angle) * offset
              });
            } else {
              const tagNode = tagNodesMap.get(tagId);
              tagNode.degree++;
              tagNode.radius = getRadius(tagNode.degree);
            }
            newLinks.push({ source: n.id, target: tagId });
          });
        }
      });
      nodes = nodes.concat(Array.from(tagNodesMap.values()));
      links = links.concat(newLinks);
    }
    if (showAttachments) {
      const attNodesMap = /* @__PURE__ */ new Map();
      const newLinks = [];
      nodes.forEach((n) => {
        if (n.attachments && n.attachments.length > 0) {
          n.attachments.forEach((attObj) => {
            const attId = attObj.id;
            if (!attNodesMap.has(attId)) {
              const angle = Math.random() * Math.PI * 2;
              const offset = 20;
              attNodesMap.set(attId, {
                id: attId,
                title: attObj.title,
                url: attObj.url,
                isAttachment: true,
                exists: true,
                degree: 1,
                radius: getRadius(1),
                x: (n.x || cx) + Math.cos(angle) * offset,
                y: (n.y || cy) + Math.sin(angle) * offset
              });
            } else {
              const attNode = attNodesMap.get(attId);
              attNode.degree++;
              attNode.radius = getRadius(attNode.degree);
            }
            newLinks.push({ source: n.id, target: attId });
          });
        }
      });
      nodes = nodes.concat(Array.from(attNodesMap.values()));
      links = links.concat(newLinks);
    }
    drawGraph(nodes, links, centerNodeId, initialAlpha, currentTransform);
  }
  function drawGraph(nodes, links, centerNodeId, initialAlpha = 1, currentTransform = null) {
    if (!container) return;
    container.innerHTML = "";
    container.style.flex = "1";
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const d3 = window.d3;
    svg = window.d3.select(container).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", [0, 0, width, height]);
    g = svg.append("g");
    zoomBehavior = window.d3.zoom().scaleExtent([0.2, 5]).on("zoom", (event) => {
      g.attr("transform", event.transform);
      updateLabelVisibility(event.transform.k);
    });
    svg.call(zoomBehavior);
    if (currentTransform) {
      svg.call(zoomBehavior.transform, currentTransform);
    } else {
      const defaultFit = getDefaultGraphTransform(width, height);
      svg.call(zoomBehavior.transform, defaultFit.transform);
    }
    simulation = window.d3.forceSimulation(nodes).alpha(initialAlpha).force("link", window.d3.forceLink(links).id((d) => d.id).distance(120)).force("charge", window.d3.forceManyBody().strength(-280)).force("x", window.d3.forceX(width / 2).strength(0.05)).force("y", window.d3.forceY(height / 2).strength(0.05)).force("collide", window.d3.forceCollide().radius((d) => d.radius + 6));
    const link = g.append("g").selectAll("line").data(links).join("line").attr("class", "graph-link");
    const nodeGroup = g.append("g").selectAll("g").data(nodes).join("g").on("mouseover", handleMouseOver).on("mouseout", handleMouseOut).on("click", (event, d) => {
      if (d.url) {
        if (d.isAttachment) {
          window.open(d.url, "_blank");
        } else if (window.daybookNavigateTo) {
          window.daybookNavigateTo(d.url);
        } else {
          window.location.href = d.url;
        }
      }
    }).call(drag(simulation));
    const circle = nodeGroup.append("circle").attr("class", (d) => {
      let cls = "graph-node";
      if (d.id === centerNodeId) cls += " is-center";
      if (d.isTag) cls += " is-tag";
      if (d.isAttachment) cls += " is-attachment";
      if (!d.exists && !d.isTag && !d.isAttachment) cls += " is-missing";
      return cls;
    }).attr("r", (d) => d.radius);
    const label = nodeGroup.append("text").attr("class", (d) => {
      if (d.isTag) return "graph-label is-tag";
      if (d.isAttachment) return "graph-label is-attachment";
      return "graph-label";
    }).attr("dy", (d) => d.radius + 12).attr("text-anchor", "middle").text((d) => d.title);
    simulation.on("tick", () => {
      link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
    function handleMouseOver(event, d) {
      if (!container) return;
      const connectedNodeIds = /* @__PURE__ */ new Set();
      connectedNodeIds.add(d.id);
      links.forEach((l) => {
        const sourceId = typeof l.source === "string" ? l.source : l.source.id;
        const targetId = typeof l.target === "string" ? l.target : l.target.id;
        if (sourceId === d.id) connectedNodeIds.add(targetId);
        if (targetId === d.id) connectedNodeIds.add(sourceId);
      });
      container.classList.add("graph-dimmed");
      nodeGroup.selectAll(".graph-node").classed("is-highlight", (n) => connectedNodeIds.has(n.id)).classed("is-hovered", (n) => n.id === d.id);
      nodeGroup.selectAll(".graph-label").classed("is-highlight", (n) => connectedNodeIds.has(n.id)).classed("is-hovered", (n) => n.id === d.id);
      link.classed("is-highlight", (l) => l.source.id === d.id || l.target.id === d.id);
      const currentGroup = window.d3.select(event.currentTarget);
      currentGroup.select(".graph-node").transition().duration(250).ease(window.d3.easeCubicOut).attr("r", d.radius * 1.5);
      currentGroup.select(".graph-label").transition().duration(250).ease(window.d3.easeCubicOut).attr("dy", d.radius * 1.5 + 15);
    }
    function handleMouseOut(event, d) {
      if (!container) return;
      if (isDragging) return;
      container.classList.remove("graph-dimmed");
      nodeGroup.selectAll(".graph-node").classed("is-highlight is-hovered", false);
      nodeGroup.selectAll(".graph-label").classed("is-highlight is-hovered", false);
      link.classed("is-highlight", false);
      const currentGroup = window.window.d3.select(event.currentTarget);
      currentGroup.select(".graph-node").transition().duration(250).ease(window.window.d3.easeCubicOut).attr("r", d.radius);
      currentGroup.select(".graph-label").transition().duration(250).ease(window.window.d3.easeCubicOut).attr("dy", d.radius + 12);
    }
    window.__graphNodes = nodeGroup;
    if (svg && svg.node()) {
      updateLabelVisibility(window.d3.zoomTransform(svg.node()).k);
    }
  }
  function updateLabelVisibility(scale) {
    if (!window.__graphNodes) return;
    const w = container?.clientWidth || 800;
    const h = container?.clientHeight || 600;
    const defaultFit = getDefaultGraphTransform(w, h);
    const fitScale = defaultFit.scale;
    const relativeScale = scale / fitScale;
    const avgDegree = graphMeta && graphMeta.linkCount && graphMeta.nodeCount ? graphMeta.linkCount * 2 / graphMeta.nodeCount : 2;
    const importantThreshold = Math.max(3, avgDegree * 1.5);
    const LABEL_ALL_MIN_RELATIVE_SCALE = 0.8;
    const LABEL_IMPORTANT_MIN_RELATIVE_SCALE = 0.55;
    window.__graphNodes.selectAll(".graph-label").style("opacity", function(d) {
      if (this.classList.contains("is-match") || this.classList.contains("is-highlight")) return 1;
      if (relativeScale >= LABEL_ALL_MIN_RELATIVE_SCALE) return 1;
      if (relativeScale >= LABEL_IMPORTANT_MIN_RELATIVE_SCALE) {
        return d.degree >= importantThreshold ? 1 : 0;
      }
      return 0;
    });
  }
  function drag(simulation2) {
    function dragstarted(event, d) {
      if (!event.active) simulation2.alphaTarget(0.3).restart();
      isDragging = true;
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation2.alphaTarget(0);
      isDragging = false;
      d.fx = null;
      d.fy = null;
    }
    return window.window.d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }
  function setupEventListeners() {
    if (orphanBtn) {
      orphanBtn.onclick = () => {
        showOrphans = !showOrphans;
        orphanBtn.setAttribute("aria-expanded", String(showOrphans));
        render(0.3);
      };
    }
    if (resetBtn) {
      resetBtn.onclick = () => {
        const url = new URL(window.location.href);
        if (url.searchParams.has("node")) {
          url.searchParams.delete("node");
          url.searchParams.delete("depth");
          window.history.pushState({}, "", url);
          render();
        } else if (svg && zoomBehavior && container) {
          const w = container.clientWidth || 800;
          const h = container.clientHeight || 600;
          const defaultFit = getDefaultGraphTransform(w, h);
          svg.transition().duration(750).call(
            zoomBehavior.transform,
            defaultFit.transform
          );
        }
      };
    }
    if (searchBtn && actionsHorizontal) {
      searchBtn.onclick = () => {
        const isOpen = actionsHorizontal.classList.toggle("is-search-open");
        if (isOpen && searchInput) searchInput.focus();
      };
    }
    if (tagsBtn) {
      tagsBtn.onclick = () => {
        showTags = !showTags;
        tagsBtn.setAttribute("aria-expanded", String(showTags));
        render(0.15);
      };
    }
    if (attachmentsBtn) {
      attachmentsBtn.onclick = () => {
        showAttachments = !showAttachments;
        attachmentsBtn.setAttribute("aria-expanded", String(showAttachments));
        render(0.15);
      };
    }
    if (searchInput) {
      searchInput.oninput = (e) => {
        const val = e.target.value.trim().toLowerCase();
        const graphNodes = window.__graphNodes;
        if (!graphNodes) return;
        if (!val) {
          if (container) container.classList.remove("graph-dimmed");
          graphNodes.selectAll(".graph-node, .graph-label").classed("is-highlight is-match", false);
          if (svg && svg.node()) updateLabelVisibility(window.window.d3.zoomTransform(svg.node()).k);
          return;
        }
        if (container) container.classList.add("graph-dimmed");
        let hasMatch = false;
        const d3 = window.d3;
        graphNodes.each(function(d) {
          const match = d.title.toLowerCase().includes(val);
          if (match) hasMatch = true;
          window.d3.select(this).select(".graph-node").classed("is-highlight", match);
          window.d3.select(this).select(".graph-label").classed("is-highlight is-match", match);
        });
        if (svg && svg.node()) updateLabelVisibility(window.d3.zoomTransform(svg.node()).k);
      };
    }
  }
  window.DaybookGraph = { init, destroy };
})();
//# sourceMappingURL=graph.js.map
