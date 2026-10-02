import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

// A portable graph with connected notes, orphans, shared tags and attachments.
const notes = Array.from({ length: 53 }, (_, i) => ({
  id: `note-${i}`, title: `Node ${i}`, exists: true, degree: i < 48 ? 2 : 0,
  tags: [{ id: `tag-${i % 6}`, title: `Tag ${i % 6}` }],
  attachments: [{ id: `attachment-${i % 8}`, title: `File ${i % 8}`, url: `/files/${i % 8}.png` }],
}));
const graph = {
  nodes: notes,
  links: notes.slice(0, 48).map((node, i) => ({ source: node.id, target: `note-${(i + 1) % 48}` })),
  meta: { layoutDiameter: 7, nodeCount: notes.length, linkCount: 48 },
};

try {
  await page.route('https://daybook.test/**', route => {
    if (new URL(route.request().url()).pathname === '/graph.json') return route.fulfill({ json: graph });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="margin:0">
      <div class="graph-actions-horizontal" style="height:50px">
        <button id="graph-orphan-btn">Orphans</button><button id="graph-tags-btn">Tags</button>
        <button id="graph-attachments-btn">Attachments</button><button id="graph-reset">Reset</button>
        <button id="graph-search-btn">Search</button><input id="graph-search-input">
      </div><div id="graph-container" style="width:1100px;height:720px"></div>
    </body></html>` });
  });
  await page.goto('https://daybook.test/graph/');
  await page.addStyleTag({ path: path.join(root, 'internal/embedded/static/css/pages/graph.css') });
  await page.addScriptTag({ path: path.join(root, 'internal/embedded/static/js/vendor/d3.min.js') });
  await page.evaluate(() => {
    window.__graphSimulations = [];
    const original = window.d3.forceSimulation;
    window.d3.forceSimulation = (...args) => {
      const simulation = original(...args);
      const record = { simulation, ticks: 0 };
      simulation.on('tick.regression', () => record.ticks++);
      window.__graphSimulations.push(record);
      return simulation;
    };
  });
  await page.addScriptTag({ path: process.argv[2] || path.join(root, 'internal/embedded/static/js/graph.js') });
  await page.evaluate(() => window.DaybookGraph.init(document));
  await page.waitForSelector('.graph-node');
  await page.waitForFunction(() => window.__graphSimulations[0].simulation.alpha() < 0.03);

  const initialTransform = await page.evaluate(() => ({ ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) }));
  const buttons = ['graph-orphan-btn', 'graph-tags-btn', 'graph-attachments-btn'];
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const button of buttons) {
      const state = await page.evaluate(button => {
        window.__graphSimulations.at(-1).simulation.stop();
        const svg = document.querySelector('#graph-container svg');
        const transform = { ...window.d3.zoomTransform(svg) };
        const before = new Map();
        window.__graphNodes.each(function(node) { before.set(node.id, { element: this, x: node.x, y: node.y }); });
        document.getElementById(button).click();
        let maxDisplacement = 0;
        let retainedElements = true;
        window.__graphNodes.each(function(node) {
          const previous = before.get(node.id);
          if (!previous) return;
          retainedElements &&= previous.element === this;
          maxDisplacement = Math.max(maxDisplacement, Math.hypot(node.x - previous.x, node.y - previous.y));
        });
        return {
          simulations: window.__graphSimulations.length,
          sameSvg: document.querySelector('#graph-container svg') === svg,
          transform, afterTransform: { ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) },
          maxDisplacement, retainedElements,
        };
      }, button);
      assert.equal(state.simulations, 1, 'Filter toggles must not create competing force simulations');
      assert.equal(state.sameSvg, true, 'Filters must preserve the current SVG and drag coordinate space');
      assert.equal(state.retainedElements, true, 'Visible nodes must keep their elements');
      assert.equal(state.maxDisplacement, 0, 'Filters must not reset existing node positions');
      assert.deepEqual(state.afterTransform, state.transform, 'Filters must preserve zoom and pan');
    }
  }

  // Restore one hidden tag and attachment without randomizing their coordinates.
  for (const button of ['graph-tags-btn', 'graph-attachments-btn', 'graph-orphan-btn']) {
    const position = await page.evaluate(button => {
      const simulation = window.__graphSimulations[0].simulation;
      simulation.stop();
      const id = button === 'graph-tags-btn' ? 'tag-0' : button === 'graph-attachments-btn' ? 'attachment-0' : 'note-52';
      if (!window.__graphNodes.data().some(node => node.id === id)) document.getElementById(button).click();
      simulation.stop();
      const node = window.__graphNodes.data().find(node => node.id === id);
      const before = [node.x, node.y];
      document.getElementById(button).click();
      simulation.stop();
      document.getElementById(button).click();
      const restored = window.__graphNodes.data().find(node => node.id === id);
      return { before, after: [restored.x, restored.y] };
    }, button);
    assert.deepEqual(position.after, position.before, 'Hidden nodes must return at their previous position');
  }

  async function dragNode() {
    await page.evaluate(() => window.__graphSimulations[0].simulation.stop());
    const node = page.locator('.graph-node:not(.is-tag):not(.is-attachment)').first();
    const box = await node.boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const distances = [];
    for (let step = 1; step <= 12; step++) {
      const pointer = { x: start.x + step * 5, y: start.y + step * 2 };
      await page.mouse.move(pointer.x, pointer.y);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      distances.push(await node.evaluate((circle, pointer) => {
        const box = circle.getBoundingClientRect();
        return Math.hypot(box.x + box.width / 2 - pointer.x, box.y + box.height / 2 - pointer.y);
      }, pointer));
    }
    await page.mouse.up();
    assert.ok(Math.max(...distances) < 4, `Dragged node must follow the pointer without a zoom workaround: ${JSON.stringify(distances)}`);
    assert.equal(await page.evaluate(() => window.__graphSimulations[0].simulation.alphaTarget()), 0);
    return Math.max(...distances);
  }

  const beforeZoom = await dragNode();
  await page.mouse.move(550, 400);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(200);
  const afterZoom = await dragNode();
  await page.locator('#graph-reset').click();
  await page.waitForTimeout(850);
  assert.deepEqual(await page.evaluate(() => ({ ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) })), initialTransform);

  await page.evaluate(() => window.DaybookGraph.destroy());
  const ticks = await page.evaluate(() => window.__graphSimulations.map(record => record.ticks));
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => window.__graphSimulations.map(record => record.ticks)), ticks, 'Leaving the graph must stop all simulation work');
  assert.equal(await page.locator('#graph-container svg').count(), 0);
  await page.evaluate(() => window.DaybookGraph.init(document));
  assert.equal(await page.locator('#graph-container svg').count(), 1);
  assert.equal(await page.evaluate(() => window.__graphSimulations.length), 2);
  assert.deepEqual(errors, []);
  console.log(`Graph interaction regression passed: 12 filter changes, one simulation, drag error ${beforeZoom.toFixed(2)}px before zoom / ${afterZoom.toFixed(2)}px after zoom.`);
} finally {
  await browser.close();
}
