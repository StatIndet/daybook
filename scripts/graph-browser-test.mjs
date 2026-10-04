import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graphScript = process.argv[2] || path.join(root, 'internal/embedded/static/js/graph.js');
const browser = await chromium.launch({ headless: true });
const errors = [];

function fixture(count = 53, missing = true) {
  const connected = count === 53 ? 48 : Math.floor(count * .9);
  const notes = Array.from({ length: count }, (_, i) => ({
    id: `note-${i}`, title: `Node ${i}`, exists: true, degree: i < connected ? 2 : 0,
    file: `Note ${String(i).padStart(2, '0')}.md`, path: `notes/${i % 2 ? 'Odd' : 'Even'}/Note ${String(i).padStart(2, '0')}.md`,
    date: `2026-01-${i < 2 ? '01' : i < 4 ? '02' : '03'}`,
    tags: [{ id: `tag-${i % 6}`, title: `Tag ${i % 6}` }],
    attachments: [{ id: `attachment-${i % 8}`, title: `File ${i % 8}`, file: `File ${i % 8}.png`, path: `files/${i % 8}.png`, url: `/files/${i % 8}.png` }],
  }));
  const links = notes.slice(0, connected).map((node, i) => ({ source: node.id, target: `note-${(i + 1) % connected}` }));
  links.push({ source: 'note-1', target: 'note-0' });
  const nodes = [...notes];
  if (missing) {
    nodes.push({ id: 'missing', title: 'Unwritten', file: 'Unwritten.md', path: 'notes/Unwritten.md', exists: false, degree: 1 });
    links.push({ source: 'note-2', target: 'missing' });
  }
  return {
    graph: { version: 1, nodes, links, meta: { layoutDiameter: Math.max(7, Math.sqrt(count)), nodeCount: nodes.length, linkCount: links.length } },
    index: { version: 1, documents: notes.map((note, i) => ({
      id: note.id, text: i === 2 ? 'Needle content\nSecond line' : 'Ordinary published content',
      lines: i === 2 ? ['Needle content', 'Second line'] : ['Ordinary published content'],
      sections: i === 2 ? ['Needle content\nSecond line'] : ['Ordinary published content'], properties: { status: i === 2 ? 'done' : 'open' },
    })) },
    indexRequests: 0, failIndex: false,
  };
}

async function openGraph(data, { reducedMotion = 'no-preference', clock = false, viewport = { width: 1200, height: 850 }, storageUnavailable = false } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.on('pageerror', error => errors.push(error.message));
  if (clock) {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  }
  if (storageUnavailable) await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem']) Storage.prototype[name] = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
  });
  await page.route('https://daybook.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/graph.json')) return route.fulfill({ json: data.graph });
    if (pathname.endsWith('/graph-search.json')) {
      data.indexRequests++;
      return data.failIndex ? route.fulfill({ status: 503, body: 'Temporarily unavailable' }) : route.fulfill({ json: data.index });
    }
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root { --color-paper:#fff; --color-page:#f6f5f3; --color-text:#292725; --color-muted:#73716e; --color-line:#dad7d3; --color-accent:#705d92; --font-ui:Arial,sans-serif; --font-serif:Georgia,serif; --syntax-inserted:#4f9569; --graph-node-attachment:#5b8def; }
      *{box-sizing:border-box}body{margin:0;padding:16px}.graph-shell{width:100%;height:720px}
      </style></head><body><div class="graph-shell"><div id="graph-controls"></div><div id="graph-container"></div></div></body></html>` });
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
  await page.addScriptTag({ path: graphScript });
  await page.evaluate(() => window.DaybookGraph.init(document));
  return page;
}
const click = (page, selector) => page.locator(selector).evaluate(element => element.click());
const ids = page => page.evaluate(() => window.__graphNodes.data().map(node => node.id).sort());
const setQuery = (page, value) => page.locator('#graph-search-input').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
const waitIDs = (page, expected) => page.waitForFunction(expected => JSON.stringify(window.__graphNodes.data().map(node => node.id).sort()) === JSON.stringify([...expected].sort()), expected);
const setValue = (page, selector, value) => page.locator(selector).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);

try {
  const data = fixture();
  const page = await openGraph(data);
  await page.waitForSelector('.graph-node');
  await page.waitForFunction(() => window.__graphSimulations[0].simulation.alpha() < 0.03);
  assert.equal(await page.locator('#graph-settings-panel').isHidden(), true, 'Settings start collapsed');
  assert.equal(data.indexRequests, 0, 'No content index fetch for an empty query');
  const initialTransform = await page.evaluate(() => ({ ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) }));

  for (let cycle = 0; cycle < 4; cycle++) {
    for (const button of ['graph-orphan-btn', 'graph-tags-btn', 'graph-attachments-btn']) {
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
        return { simulations: window.__graphSimulations.length, sameSvg: document.querySelector('#graph-container svg') === svg,
          transform, afterTransform: { ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) }, maxDisplacement, retainedElements };
      }, button);
      assert.equal(state.simulations, 1, 'Filter toggles must not create competing force simulations');
      assert.equal(state.sameSvg, true, 'Filters must preserve the current SVG and drag coordinate space');
      assert.equal(state.retainedElements, true, 'Visible nodes must keep their elements');
      assert.equal(state.maxDisplacement, 0, 'Filters must not reset existing node positions');
      assert.deepEqual(state.afterTransform, state.transform, 'Filters must preserve zoom and pan');
    }
  }
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
  await click(page, '#graph-defaults');
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
    assert.ok(Math.max(...distances) < 4, `Dragged node must follow the pointer: ${JSON.stringify(distances)}`);
    assert.equal(await page.evaluate(() => window.__graphSimulations[0].simulation.alphaTarget()), 0);
    return Math.max(...distances);
  }
  const beforeZoom = await dragNode();
  await page.mouse.move(550, 400);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(200);
  const afterZoom = await dragNode();
  await click(page, '#graph-reset');
  await page.waitForTimeout(650);
  assert.deepEqual(await page.evaluate(() => ({ ...window.d3.zoomTransform(document.querySelector('#graph-container svg')) })), initialTransform);

  await page.locator('#graph-settings-btn').click();
  await setQuery(page, 'file:"Note 00.md"');
  await waitIDs(page, ['note-0']);
  assert.equal(await page.locator('.graph-link').count(), 0, 'Filtering removes edges with hidden endpoints');
  assert.equal(data.indexRequests, 0, 'Filename filters do not need the content index');
  await setQuery(page, 'file:');
  await page.waitForFunction(() => document.querySelector('#graph-query-error').textContent.length > 0);
  assert.deepEqual(await ids(page), ['note-0'], 'Invalid query preserves the preceding valid result');
  await setQuery(page, 'file:"Note 00.md"');
  await page.waitForFunction(() => document.querySelector('#graph-search-input').getAttribute('aria-invalid') === 'false');
  await click(page, '#graph-orphan-btn');
  assert.deepEqual(await ids(page), [], 'A formerly connected note is an orphan after its neighbors are filtered');
  await click(page, '#graph-orphan-btn');
  await waitIDs(page, ['note-0']);

  data.failIndex = true;
  await setQuery(page, 'needle');
  await page.waitForFunction(() => document.querySelector('.graph-status .graph-error').textContent.includes('unavailable'));
  assert.equal(data.indexRequests, 1);
  assert.deepEqual(await ids(page), ['note-0'], 'Index failure preserves the last valid result');
  await setQuery(page, 'file:"Note 01.md"');
  await waitIDs(page, ['note-1']);
  assert.equal(data.indexRequests, 1, 'Metadata queries still work after index failure');
  await setQuery(page, 'needle');
  await page.waitForFunction(() => document.querySelector('.graph-status .graph-error').textContent.includes('unavailable'));
  assert.equal(data.indexRequests, 2);
  data.failIndex = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await waitIDs(page, ['note-2']);
  assert.equal(data.indexRequests, 3, 'Explicit retry loads the index successfully');
  await setQuery(page, 'line:(needle second)');
  await waitIDs(page, []);
  await setQuery(page, 'section:(needle second) [status:done]');
  await waitIDs(page, ['note-2']);
  assert.equal(data.indexRequests, 3, 'A loaded index is reused for later scoped queries');
  await click(page, '#graph-defaults');
  assert.equal(await page.locator('.graph-node').count(), 53);
  await click(page, '#graph-existing-btn');
  assert.ok((await ids(page)).includes('missing'), 'Missing-reference toggle reveals the placeholder');
  assert.equal(await page.locator('.graph-node.is-missing').count(), 1);
  await click(page, '#graph-defaults');

  await page.locator('.graph-section > summary').nth(2).click();
  await click(page, '#graph-arrows');
  const reciprocal = await page.locator('.graph-link').evaluateAll(links => links.map(element => ({
    source: element.__data__.source.id, target: element.__data__.target.id,
    start: element.getAttribute('marker-start'), end: element.getAttribute('marker-end'),
  })).filter(link => [link.source, link.target].includes('note-0') && [link.source, link.target].includes('note-1')));
  assert.equal(reciprocal.length, 1, 'Reciprocal references share one force link');
  assert.ok(reciprocal[0].start && reciprocal[0].end, 'Reciprocal references have arrows at both ends');
  assert.equal(await page.evaluate(() => window.__graphNodes.data().find(node => node.id === 'note-0').degree), 2, 'Degree counts unique neighbors');
  const appearance = await page.evaluate(() => {
    const simulation = window.__graphSimulations[0].simulation;
    simulation.stop().alpha(.015);
    const before = window.__graphNodes.data().map(({ id, x, y }) => [id, x, y]);
    for (const [id, value] of [['graph-lineWidth', '2'], ['graph-textFade', '.5']]) {
      const input = document.getElementById(id); input.value = value; input.dispatchEvent(new Event('input'));
    }
    return { alpha: simulation.alpha(), before, after: window.__graphNodes.data().map(({ id, x, y }) => [id, x, y]) };
  });
  assert.equal(appearance.alpha, .015, 'Line and text styling must not reheat the simulation');
  assert.deepEqual(appearance.after, appearance.before);
  assert.equal(await page.locator('.graph-link').first().getAttribute('stroke-width'), '2');

  await page.locator('.graph-section > summary').nth(1).click();
  await page.getByRole('button', { name: 'New color group', exact: true }).click();
  await setValue(page, '.graph-group:nth-child(1) > .graph-query', 'file:.md');
  await page.waitForFunction(() => document.querySelector('.graph-node').style.fill === 'rgb(224, 82, 82)');
  await page.getByRole('button', { name: 'New color group', exact: true }).click();
  await setValue(page, '.graph-group:nth-child(2) > .graph-query', 'file:.md');
  await page.waitForTimeout(180);
  assert.equal(await page.locator('.graph-node').first().evaluate(node => node.style.fill), 'rgb(224, 82, 82)', 'The first matching color group wins');
  await page.locator('.graph-group').nth(1).getByRole('button', { name: 'Move up', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.graph-node').style.fill === 'rgb(91, 141, 239)');
  const firstGroup = page.locator('.graph-group').first();
  await firstGroup.locator('.graph-swatch').click();
  await firstGroup.getByRole('textbox', { name: 'HEX', exact: true }).fill('#00FF00');
  await page.waitForFunction(() => document.querySelector('.graph-node').style.fill === 'rgb(0, 255, 0)');
  await firstGroup.locator('.graph-color-format').selectOption('rgb');
  assert.deepEqual(await firstGroup.locator('.graph-color-input').evaluateAll(inputs => inputs.map(input => input.value)), ['0', '255', '0']);
  await firstGroup.locator('.graph-color-format').selectOption('hsl');
  assert.deepEqual(await firstGroup.locator('.graph-color-input').evaluateAll(inputs => inputs.map(input => input.value)), ['120', '100', '50']);
  await firstGroup.locator('.graph-color-format').selectOption('hex');
  await firstGroup.getByRole('textbox', { name: 'HEX', exact: true }).fill('invalid');
  assert.equal(await firstGroup.getByRole('textbox', { name: 'HEX', exact: true }).getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('.graph-node').first().evaluate(node => node.style.fill), 'rgb(0, 255, 0)', 'Invalid colors retain the last valid color');
  await firstGroup.getByRole('textbox', { name: 'HEX', exact: true }).fill('#00FF00');
  await firstGroup.locator('.graph-color-square').press('ArrowLeft');
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator('.graph-node').first().evaluate(node => node.style.fill), 'rgb(0, 255, 0)', 'Color square works with a keyboard');
  await page.evaluate(() => window.__graphSimulations[0].simulation.stop().alpha(.015));
  await firstGroup.getByRole('textbox', { name: 'HEX', exact: true }).fill('#00FF00');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__graphSimulations[0].simulation.alpha()), .015, 'Color changes must not reheat the simulation');
  await setValue(page, '.graph-group:nth-child(1) > .graph-query', 'task:unsupported');
  await page.waitForFunction(() => document.querySelector('.graph-group > .graph-error').textContent.length > 0);
  assert.equal(await page.locator('.graph-node').first().evaluate(node => node.style.fill), 'rgb(0, 255, 0)', 'An invalid group query retains its last valid match');
  await firstGroup.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.graph-node').style.fill === 'rgb(224, 82, 82)');

  await setQuery(page, 'file:"Note 00.md"');
  await waitIDs(page, ['note-0']);
  assert.equal(await page.evaluate(() => window.__graphSimulations.length), 1, 'All controls use the same simulation');
  await page.evaluate(() => window.DaybookGraph.destroy());
  const ticks = await page.evaluate(() => window.__graphSimulations.map(record => record.ticks));
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => window.__graphSimulations.map(record => record.ticks)), ticks, 'Destroy stops every old simulation');
  assert.equal(await page.locator('#graph-container svg').count(), 0);
  await page.evaluate(() => window.DaybookGraph.init(document));
  await waitIDs(page, ['note-0']);
  assert.equal(await page.locator('#graph-search-input').inputValue(), 'file:"Note 00.md"', 'Query persists across graph visits');
  assert.equal(await page.locator('.graph-group').count(), 1, 'Color groups persist across graph visits');
  assert.equal(await page.locator('#graph-lineWidth').inputValue(), '2');
  assert.equal(await page.evaluate(() => window.__graphSimulations.length), 2);
  await click(page, '#graph-defaults');
  assert.equal(await page.locator('.graph-node').count(), 53);
  assert.equal(await page.locator('#graph-search-input').inputValue(), '');
  assert.equal(await page.locator('.graph-group').count(), 0);
  assert.equal(await page.locator('#graph-lineWidth').inputValue(), '1');
  assert.equal(await page.locator('#graph-arrows').isChecked(), false);
  const storage = await page.evaluate(() => JSON.parse(localStorage.getItem('daybook:graph:/')));
  assert.equal(storage.settings.query, '');
  assert.deepEqual(storage.settings.groups, []);
  await page.evaluate(() => {
    history.pushState({}, '', '?node=note-0&depth=1');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  assert.deepEqual(await ids(page), ['note-0', 'note-1', 'note-47']);
  await click(page, '#graph-defaults');
  assert.deepEqual(await ids(page), ['note-0', 'note-1', 'note-47'], 'Restore defaults preserves local graph scope');
  await page.getByRole('button', { name: 'Full graph', exact: true }).click();
  assert.equal(await page.locator('.graph-node').count(), 53);
  await page.evaluate(() => {
    document.documentElement.lang = 'zh-CN';
    document.dispatchEvent(new Event('daybook:lang-change'));
  });
  assert.equal(await page.locator('#graph-settings-btn').textContent(), '图谱设置');
  assert.equal(await page.evaluate(() => window.__graphSimulations.length), 2, 'Language changes retain the simulation');

  // Leaving during an active drag must release D3's window-level pointer listeners.
  await page.evaluate(() => window.__graphSimulations.at(-1).simulation.stop());
  const dragBox = await page.locator('.graph-node').first().boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 10, dragBox.y + dragBox.height / 2 + 10);
  await page.evaluate(() => window.DaybookGraph.destroy());
  await page.mouse.up();
  assert.equal(await page.locator('#graph-container svg').count(), 0);
  await page.close();
  console.log(`Graph interaction regression passed: 12 filter changes, one simulation, drag error ${beforeZoom.toFixed(2)}px / ${afterZoom.toFixed(2)}px; filters, index retry, arrows, colors, and persistence verified.`);

  const animated = await openGraph(fixture(), { reducedMotion: 'reduce', clock: true });
  await click(animated, '#graph-existing-btn');
  await click(animated, '#graph-tags-btn');
  await click(animated, '#graph-attachments-btn');
  const fullIDs = await ids(animated);
  await click(animated, '#graph-play');
  assert.equal(await animated.locator('#graph-play').textContent(), 'Pause');
  assert.deepEqual(await ids(animated), ['attachment-0', 'attachment-1', 'note-0', 'note-1', 'tag-0', 'tag-1']);
  const firstBatchPositions = await animated.evaluate(() => window.__graphNodes.data().map(({ id, x, y }) => [id, x, y]));
  await animated.clock.runFor(4100);
  assert.ok((await ids(animated)).includes('note-2'));
  assert.ok((await ids(animated)).includes('missing'), 'Undated placeholder appears with its first dated neighbor');
  assert.ok(!(await ids(animated)).includes('note-4'));
  const retainedBatchPositions = await animated.evaluate(first => {
    const retained = new Set(first.map(([id]) => id));
    return window.__graphNodes.data().filter(node => retained.has(node.id)).map(({ id, x, y }) => [id, x, y]);
  }, firstBatchPositions);
  assert.deepEqual(retainedBatchPositions, firstBatchPositions, 'Reduced-motion batches retain existing node coordinates');
  await click(animated, '#graph-play');
  assert.equal(await animated.locator('#graph-play').textContent(), 'Resume');
  const pausedIDs = await ids(animated);
  const progress = await animated.locator('progress').getAttribute('value');
  await animated.clock.runFor(5000);
  assert.deepEqual(await ids(animated), pausedIDs, 'Pause freezes the animation batch');
  assert.equal(await animated.locator('progress').getAttribute('value'), progress);
  await click(animated, '#graph-play');
  await animated.clock.runFor(4100);
  assert.ok((await ids(animated)).includes('note-4'));
  await click(animated, '#graph-stop');
  assert.deepEqual(await ids(animated), fullIDs, 'Stop restores the complete filtered graph');
  assert.equal(await animated.locator('#graph-stop').isDisabled(), true);
  await click(animated, '#graph-play');
  await animated.clock.runFor(12_100);
  assert.equal(await animated.locator('#graph-play').textContent(), 'Animate');
  assert.equal(await animated.locator('progress').getAttribute('value'), '1');
  assert.deepEqual(await ids(animated), fullIDs);
  await animated.clock.runFor(15_000);
  assert.deepEqual(await ids(animated), fullIDs, 'Animation does not automatically loop');
  await click(animated, '#graph-play');
  await setQuery(animated, 'file:"Note 00.md"');
  assert.equal(await animated.locator('#graph-stop').isDisabled(), true, 'Changing the filter stops the animation');
  await animated.clock.runFor(250);
  assert.deepEqual(await ids(animated), ['attachment-0', 'note-0', 'tag-0']);
  assert.equal(await animated.evaluate(() => window.__graphSimulations.length), 1);
  assert.equal(await animated.evaluate(() => window.__graphSimulations[0].ticks), 0, 'Reduced motion uses settled batches without a running force timer');
  await setQuery(animated, 'file:.png');
  await animated.clock.runFor(250);
  assert.equal((await ids(animated)).length, 8);
  assert.equal(await animated.locator('#graph-play').isDisabled(), true, 'An attachment-only selection has no dates to animate');
  assert.equal(await animated.locator('.graph-animation .graph-hint').textContent(), 'No dated notes in this selection');
  await animated.evaluate(() => window.DaybookGraph.destroy());
  await animated.clock.runFor(20_000);
  assert.equal(await animated.locator('#graph-container svg').count(), 0, 'Destroy cancels the animation frame');
  await animated.close();
  console.log('Date animation regression passed: same-day batches, placeholders, pause/resume/stop, completion, filter cancellation and reduced motion.');

  const mobile = await openGraph(fixture(), { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', storageUnavailable: true });
  await mobile.locator('#graph-settings-btn').click();
  const panelBox = await mobile.locator('#graph-settings-panel').boundingBox();
  const shellBox = await mobile.locator('.graph-shell').boundingBox();
  assert.ok(panelBox.width <= shellBox.width + 1, 'Mobile drawer stays inside graph width');
  assert.ok(Math.abs(panelBox.y + panelBox.height - shellBox.y - shellBox.height) < 2, 'Mobile drawer anchors to the bottom');
  await mobile.locator('#graph-tags-btn').focus();
  await mobile.keyboard.press('Space');
  assert.equal(await mobile.locator('#graph-tags-btn').isChecked(), true, 'Switch supports keyboard interaction without localStorage');
  await mobile.keyboard.press('Escape');
  assert.equal(await mobile.locator('#graph-settings-panel').isHidden(), true);
  assert.equal(await mobile.locator('#graph-settings-btn').evaluate(button => button === document.activeElement), true, 'Closing returns keyboard focus to Settings');
  await mobile.close();

  const timings = [];
  for (const count of [100, 500, 1000]) {
    const start = performance.now();
    const sample = await openGraph(fixture(count, false));
    const loaded = performance.now();
    const before = await sample.evaluate(() => {
      const simulation = window.__graphSimulations[0].simulation;
      simulation.stop().tick(80);
      return window.__graphNodes.data().every(node => Number.isFinite(node.x) && Number.isFinite(node.y));
    });
    assert.equal(before, true, `${count} nodes settle to finite coordinates`);
    await setQuery(sample, 'path:Even');
    await sample.waitForFunction(count => window.__graphNodes.size() === Math.ceil(count / 2), count);
    const filtered = performance.now();
    const state = await sample.evaluate(() => {
      const simulation = window.__graphSimulations[0].simulation;
      simulation.stop().tick(40);
      return { simulations: window.__graphSimulations.length, finite: window.__graphNodes.data().every(node => Number.isFinite(node.x) && Number.isFinite(node.y)) };
    });
    assert.equal(state.simulations, 1);
    assert.equal(state.finite, true);
    timings.push({ nodes: count, loadMs: Math.round(loaded - start), filterAndSettleMs: Math.round(filtered - loaded) });
    await sample.close();
  }
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  console.log(`Graph scale smoke timings (informational): ${JSON.stringify(timings)}`);
} finally {
  await browser.close();
}
