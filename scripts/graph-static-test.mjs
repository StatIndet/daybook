import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.DAYBOOK_TEST_URL || 'http://localhost:1313';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${base}/graph/`);
  await page.waitForSelector('.graph-node');
  const count = await page.locator('.graph-node').count();
  assert.ok(count >= 2);
  await page.locator('#graph-search-btn').click();
  await page.locator('#graph-search-input').fill('line:"Hello World"');
  await page.waitForFunction(() => document.querySelectorAll('.graph-node').length === 1);
  assert.match(await page.locator('.graph-label').textContent(), /smoke-test/);
  await page.locator('#graph-search-input').fill('path:missing-no-match');
  await page.waitForFunction(() => document.querySelectorAll('.graph-node').length === 0);
  await page.locator('#graph-settings-btn').click();
  await page.locator('#graph-defaults').click();
  await page.waitForFunction(count => document.querySelectorAll('.graph-node').length === count, count);
  assert.deepEqual(await page.locator('.graph-section-title > span:last-child').allTextContents(), ['外观', '力度']);
  assert.equal(await page.locator('#graph-settings-panel details, #graph-settings-panel summary').count(), 0);
  assert.equal(await page.locator('#graph-linkDistance').isVisible(), true);
  await page.locator('#graph-nodeSize').fill('2');
  await page.locator('#graph-arrows').click();
  await page.locator('#graph-play').click();
  await page.locator('#graph-play').click();
  assert.equal(await page.locator('#graph-play').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#graph-settings-panel #graph-play, #graph-settings-panel progress, .graph-animation').count(), 0);
  await page.screenshot({ path: '/tmp/daybook-graph-desktop.png' });
  await page.locator('.graph-close').click();
  await page.reload();
  await page.waitForSelector('.graph-node');
  await page.locator('#graph-settings-btn').click();
  assert.equal(await page.locator('#graph-nodeSize').inputValue(), '2');
  await page.locator('#graph-defaults').click();
  await page.locator('.graph-close').click();
  // Exercise the actual router, hashed dependency loader and language route.
  await page.evaluate(() => window.daybookNavigateTo('/notes/'));
  await page.waitForFunction(() => location.pathname === '/notes/' && !document.documentElement.classList.contains('is-transitioning'));
  assert.equal(await page.locator('#graph-container svg').count(), 0);
  await page.evaluate(() => window.daybookNavigateTo('/en_US/graph/'));
  await page.waitForSelector('.graph-node');
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-transitioning'));
  assert.equal(await page.locator('#graph-settings-btn').getAttribute('aria-label'), 'Graph settings');
  await page.locator('#graph-settings-btn').click();
  assert.deepEqual(await page.locator('.graph-section-title > span:last-child').allTextContents(), ['Display', 'Forces']);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#graph-settings-panel').matches(':modal'));
  await page.screenshot({ path: '/tmp/daybook-graph-mobile.png' });
  const bounds = await page.locator('.graph-panel').boundingBox();
  assert.deepEqual(bounds, {x: 0, y: 64, width: 390, height: 780}, 'Settings fill the mobile viewport below the top bar');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#graph-settings-panel').isVisible(), false);
  for (const width of [390, 320, 800]) {
    await page.setViewportSize({ width, height: 844 });
    for (const local of [false, true]) {
      await page.locator('#graph-full-btn').evaluate((button, local) => { button.hidden = !local; }, local);
      const buttons = await page.locator('.graph-toolbar > button:visible').all();
      const shell = await page.locator('.graph-shell').boundingBox();
      const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
      assert.equal(boxes.length, local ? 9 : 8);
      // Compare layout positions; the focused action intentionally lifts by 2px.
      const tops = await page.locator('.graph-toolbar > button:visible').evaluateAll(buttons => buttons.map(button => button.offsetTop));
      assert.equal(new Set(tops).size, 2, 'Narrow toolbar occupies two rows');
      assert.ok(boxes.every(box => box.x >= shell.x && box.x + box.width <= shell.x + shell.width + 1), 'All toolbar actions fit the graph');
      assert.ok(Math.abs(shell.y + shell.height - (844 - 8)) < 2, 'Graph fills the space below the site header');
    }
  }
  await page.setViewportSize({width:390, height:844});
  await page.locator('#graph-full-btn').evaluate(button => { button.hidden = true; });
  await page.screenshot({ path: '/tmp/daybook-graph-mobile-toolbar.png' });
  assert.deepEqual(errors, []);
  console.log('Graph static-vault regression passed (published index, toolbar, settings, animation, SPA, language and mobile).');
} finally { await browser.close(); }
