interface GraphMeta {
  defaultScale?: number;
}

interface RawNode {
  id: string;
  title: string;
  url?: string;
  exists: boolean;
  degree: number;
  tags?: string[];
}

interface GraphNode {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  title: string;
  url?: string;
  exists: boolean;
  degree: number;
  tags?: string[];
  isTag?: boolean;
  radius: number;
}

interface RawLink {
  source: string;
  target: string;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  meta?: GraphMeta;
  nodes?: RawNode[];
  links?: RawLink[];
}

(function() {
  let container: HTMLElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  let searchBtn: HTMLElement | null = null;
  let actionsHorizontal: HTMLElement | null = null;
  let orphanBtn: HTMLElement | null = null;
  let resetBtn: HTMLElement | null = null;
  let tagsBtn: HTMLElement | null = null;
  
  let showTags = false;
  let showOrphans = true;

  let rawNodes: RawNode[] = [];
  let rawLinks: RawLink[] = [];
  let graphMeta: GraphMeta | null = null;
  let adjacencyMap = new Map<string, Set<string>>();
  let simulation: any | null = null;
  let zoomBehavior: any | null = null;
  let svg: any | null = null;
  let g: any | null = null;
  let isDragging = false;

  async function init(root?: Document | HTMLElement) {
    if (!root) root = document;
    container = root.querySelector('#graph-container');
    searchInput = root.querySelector('#graph-search-input');
    searchBtn = root.querySelector('#graph-search-btn');
    tagsBtn = root.querySelector('#graph-tags-btn');
    actionsHorizontal = root.querySelector('.graph-actions-horizontal');
    orphanBtn = root.querySelector('#graph-orphan-btn');
    resetBtn = root.querySelector('#graph-reset');

    if (!container) return;

    try {
      const res = await fetch('/graph.json');
      const data: GraphData = await res.json();
      rawNodes = data.nodes || [];
      rawLinks = data.links || [];
      graphMeta = data.meta || null;

      buildAdjacencyMap(rawNodes, rawLinks);

      render();
      setupEventListeners();
    } catch (err) {
      console.error('Failed to load graph data:', err);
    }
  }

  function destroy() {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    if (container) {
      container.innerHTML = '';
    }
    rawNodes = [];
    rawLinks = [];
    graphMeta = null;
    adjacencyMap.clear();
    (window as any).__graphNodes = null;
  }

  function buildAdjacencyMap(nodes: RawNode[], links: RawLink[]) {
    adjacencyMap.clear();
    nodes.forEach(n => {
      adjacencyMap.set(n.id, new Set());
    });
    links.forEach(l => {
      if (adjacencyMap.has(l.source) && adjacencyMap.has(l.target)) {
        adjacencyMap.get(l.source)!.add(l.target);
        adjacencyMap.get(l.target)!.add(l.source);
      }
    });
  }

  function getLocalGraph(centerNodeId: string, depth: number): Set<string> {
    const visited = new Set<string>();
    const queue = [{ id: centerNodeId, d: 0 }];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      
      visited.add(current.id);
      if (current.d < depth) {
        const neighbors = adjacencyMap.get(current.id) || new Set();
        for (const n of Array.from(neighbors)) {
          if (!visited.has(n)) {
            queue.push({ id: n, d: current.d + 1 });
          }
        }
      }
    }

    return visited;
  }

  function getRadius(degree: number): number {
    const baseR = 5;
    // Absolute scaling: size depends only on the node's own connections.
    // Square root makes the area scale linearly with the degree.
    return baseR + Math.sqrt(degree) * 1.5;
  }

  function render(initialAlpha = 1) {
    let currentPositions = new Map<string, { x?: number, y?: number, vx?: number, vy?: number }>();
    let currentTransform: any | null = null;
    
    const graphNodesSelection: any | null = (window as any).__graphNodes;
    if (graphNodesSelection) {
      graphNodesSelection.each(function(d: GraphNode) {
        currentPositions.set(d.id, { x: d.x, y: d.y, vx: d.vx, vy: d.vy });
      });
      if (svg && svg.node()) {
        currentTransform = window.window.d3.zoomTransform(svg.node()!);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const centerNodeId = urlParams.get('node');
    let depth = parseInt(urlParams.get('depth') || '1', 10);
    if (isNaN(depth) || depth < 1) depth = 1;

    let filteredNodeIds: Set<string> | null = null;
    if (centerNodeId && adjacencyMap.has(centerNodeId)) {
      filteredNodeIds = getLocalGraph(centerNodeId, depth);
    }

    const cx = (container!.clientWidth || 800) / 2;
    const cy = (container!.clientHeight || 600) / 2;

    let filteredNodes = rawNodes
      .filter(n => n.exists)
      .filter(n => showOrphans || n.degree > 0)
      .filter(n => !filteredNodeIds || filteredNodeIds.has(n.id));

    const initialRadius = Math.max(50, Math.sqrt(filteredNodes.length) * 15);

    let nodes: GraphNode[] = filteredNodes.map((n, i) => {
      const existing = currentPositions.get(n.id);
      if (existing && existing.x !== undefined && existing.y !== undefined) {
        return { 
          ...n, 
          radius: getRadius(n.degree),
          x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy
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

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    let links: GraphLink[] = rawLinks
      .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map(l => ({ ...l }));

    if (showTags) {
      const tagNodesMap = new Map<string, GraphNode>();
      const newLinks: GraphLink[] = [];
      
      nodes.forEach(n => {
        if (n.tags && n.tags.length > 0) {
          n.tags.forEach(tag => {
            const tagId = 'tag-' + tag;
            if (!tagNodesMap.has(tagId)) {
              // Add a slight random offset to prevent near-zero distance singularity physics explosion
              const angle = Math.random() * Math.PI * 2;
              const offset = 20;
              tagNodesMap.set(tagId, {
                id: tagId,
                title: '#' + tag,
                isTag: true,
                exists: true,
                degree: 1,
                radius: getRadius(1),
                x: (n.x || 0) + Math.cos(angle) * offset,
                y: (n.y || 0) + Math.sin(angle) * offset
              });
            } else {
              const tagNode = tagNodesMap.get(tagId)!;
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

    drawGraph(nodes, links, centerNodeId, initialAlpha, currentTransform);
  }

  function drawGraph(nodes: GraphNode[], links: GraphLink[], centerNodeId: string | null, initialAlpha = 1, currentTransform: any | null = null) {
    if (!container) return;
    container.innerHTML = '';
    
    // Add flex: 1 style so it definitely takes height if parent is flex
    container.style.flex = "1";

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const d3 = window.d3;

    svg = window.d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height]);

    g = svg!.append('g');

    zoomBehavior = window.d3.zoom()
      .scaleExtent([0.2, 5])
      .on('zoom', (event: any) => {
        g!.attr('transform', event.transform);
        updateLabelVisibility(event.transform.k);
      });

    svg!.call(zoomBehavior);

    if (currentTransform) {
      svg!.call(zoomBehavior.transform, currentTransform);
    } else {
      let initialScale = 1.0;
      if (graphMeta && graphMeta.defaultScale) {
        initialScale = graphMeta.defaultScale;
      }
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      initialScale = isMobile ? Math.min(initialScale, 1.15) : initialScale;

      svg!.call(
        zoomBehavior.transform, 
        window.d3.zoomIdentity.translate(width/2, height/2).scale(initialScale).translate(-width/2, -height/2)
      );
    }

    simulation = window.d3.forceSimulation(nodes)
      .alpha(initialAlpha)
      .force('link', window.d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force('charge', window.d3.forceManyBody().strength(-280))
      .force('x', window.d3.forceX(width / 2).strength(0.05))
      .force('y', window.d3.forceY(height / 2).strength(0.05))
      .force('collide', window.d3.forceCollide().radius((d: any) => d.radius + 6));

    const link = g!.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'graph-link');

    const nodeGroup = g!.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .on('mouseover', handleMouseOver)
      .on('mouseout', handleMouseOut)
      .on('click', (event: any, d: GraphNode) => {
        if (d.url) {
          if (window.daybookNavigateTo) {
            window.daybookNavigateTo(d.url);
          } else {
            window.location.href = d.url;
          }
        }
      })
      .call(drag(simulation));

    const circle = nodeGroup.append('circle')
      .attr('class', (d: GraphNode) => {
        let cls = 'graph-node';
        if (d.id === centerNodeId) cls += ' is-center';
        if (d.isTag) cls += ' is-tag';
        if (!d.exists && !d.isTag) cls += ' is-missing';
        return cls;
      })
      .attr('r', (d: GraphNode) => d.radius);

    const label = nodeGroup.append('text')
      .attr('class', (d: GraphNode) => d.isTag ? 'graph-label is-tag' : 'graph-label')
      .attr('dy', (d: GraphNode) => d.radius + 12)
      .attr('text-anchor', 'middle')
      .text((d: GraphNode) => d.title);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    function handleMouseOver(event: any, d: GraphNode) {
      if (!container) return;
      const connectedNodeIds = new Set<string>();
      connectedNodeIds.add(d.id);

      links.forEach(l => {
        const sourceId = (typeof l.source === 'string') ? l.source : (l.source as GraphNode).id;
        const targetId = (typeof l.target === 'string') ? l.target : (l.target as GraphNode).id;
        if (sourceId === d.id) connectedNodeIds.add(targetId);
        if (targetId === d.id) connectedNodeIds.add(sourceId);
      });

      container.classList.add('graph-dimmed');

      nodeGroup.selectAll('.graph-node')
        .classed('is-highlight', (n: any) => connectedNodeIds.has(n.id))
        .classed('is-hovered', (n: any) => n.id === d.id);
      
      nodeGroup.selectAll('.graph-label')
        .classed('is-highlight', (n: any) => connectedNodeIds.has(n.id))
        .classed('is-hovered', (n: any) => n.id === d.id);

      link.classed('is-highlight', (l: any) => l.source.id === d.id || l.target.id === d.id);

      // Hover animation on current node
      const currentGroup = window.d3.select(event.currentTarget);
      currentGroup.select('.graph-node')
        .transition().duration(250).ease(window.d3.easeCubicOut).attr('r', d.radius * 1.5);
      currentGroup.select('.graph-label')
        .transition().duration(250).ease(window.d3.easeCubicOut).attr('dy', d.radius * 1.5 + 15);
    }

    function handleMouseOut(event: any, d: GraphNode) {
      if (!container) return;
      if (isDragging) return;
      container.classList.remove('graph-dimmed');
      nodeGroup.selectAll('.graph-node').classed('is-highlight is-hovered', false);
      nodeGroup.selectAll('.graph-label').classed('is-highlight is-hovered', false);
      link.classed('is-highlight', false);

      // Revert hover animation
      const currentGroup = window.window.d3.select(event.currentTarget);
      currentGroup.select('.graph-node')
        .transition().duration(250).ease(window.window.d3.easeCubicOut).attr('r', d.radius);
      currentGroup.select('.graph-label')
        .transition().duration(250).ease(window.window.d3.easeCubicOut).attr('dy', d.radius + 12);
    }
    
    // Expose for search
    (window as any).__graphNodes = nodeGroup;
  }

  function updateLabelVisibility(scale: number) {
    if (!(window as any).__graphNodes) return;
    (window as any).__graphNodes.selectAll('.graph-label')
      .style('opacity', function(this: Element, d: GraphNode) {
        if (this.classList.contains('is-match') || this.classList.contains('is-highlight')) return 1;
        if (scale > 1.5) return 1;
        return d.degree > 3 ? 1 : 0;
      });
  }

  function drag(simulation: any) {
    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      isDragging = true;
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      isDragging = false;
      d.fx = null;
      d.fy = null;
    }
    return window.window.d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }

  function setupEventListeners() {
    if (orphanBtn) {
      orphanBtn.onclick = () => {
        showOrphans = !showOrphans;
        orphanBtn!.setAttribute('aria-expanded', String(showOrphans));
        render(0.3);
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        const url = new URL(window.location.href);
        if (url.searchParams.has('node')) {
          url.searchParams.delete('node');
          url.searchParams.delete('depth');
          window.history.pushState({}, '', url);
          render();
        } else if (svg && zoomBehavior && container) {
          const w = container.clientWidth || 800;
          const h = container.clientHeight || 600;
          
          let resetScale = 1.0;
          if (graphMeta && graphMeta.defaultScale) {
            resetScale = graphMeta.defaultScale;
          }
          const isMobile = window.matchMedia("(max-width: 768px)").matches;
          resetScale = isMobile ? Math.min(resetScale, 1.15) : resetScale;

          const d3 = window.d3;
          svg.transition().duration(750).call(
            zoomBehavior.transform as any,
            window.d3.zoomIdentity.translate(w/2, h/2).scale(resetScale).translate(-w/2, -h/2)
          );
        }
      };
    }

    if (searchBtn && actionsHorizontal) {
      searchBtn.onclick = () => {
        const isOpen = actionsHorizontal!.classList.toggle('is-search-open');
        if (isOpen && searchInput) searchInput.focus();
      };
    }

    if (tagsBtn) {
      tagsBtn.onclick = () => {
        showTags = !showTags;
        tagsBtn!.setAttribute('aria-expanded', String(showTags));
        render(0.15); // Very soft alpha for sprouting
      };
    }

    if (searchInput) {
      searchInput.oninput = (e: Event) => {
        const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
        const graphNodes = (window as any).__graphNodes;
        if (!graphNodes) return;
        
        if (!val) {
          if (container) container.classList.remove('graph-dimmed');
          graphNodes.selectAll('.graph-node, .graph-label').classed('is-highlight is-match', false);
          if (svg && svg.node()) updateLabelVisibility(window.window.d3.zoomTransform(svg.node()!).k);
          return;
        }

        if (container) container.classList.add('graph-dimmed');
        
        let hasMatch = false;
        const d3 = window.d3;
        graphNodes.each(function(this: Element, d: GraphNode) {
          const match = d.title.toLowerCase().includes(val);
          if (match) hasMatch = true;
          window.d3.select(this).select('.graph-node').classed('is-highlight', match);
          window.d3.select(this).select('.graph-label').classed('is-highlight is-match', match);
        });
        
        if (svg && svg.node()) updateLabelVisibility(window.d3.zoomTransform(svg.node()!).k);
      };
    }
  }

  window.DaybookGraph = { init, destroy };
})();
