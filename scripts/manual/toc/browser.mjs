import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Optional checks against a built article with at least two headings and enough
// content to scroll. The caller supplies the full article URL.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.addInitScript(() => localStorage.setItem('daybook:privacy:v1', JSON.stringify({ analytics: false })));
  await page.route('**/api/privacy', route => route.fulfill({ json: { version: 1, analytics: false } }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.DAYBOOK_TOC_ARTICLE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.post-content');
  await page.evaluate(() => document.fonts.ready);
  console.log('Checking TOC Rail...');
  await page.waitForSelector('[data-reading-toc-rail-base]', { state: 'attached', timeout: 5000 });

  const initialPath = await page.getAttribute('[data-reading-toc-rail-base]', 'd');
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForFunction(initial => document.querySelector('[data-reading-toc-rail-base]').getAttribute('d') !== initial, initialPath);

  console.log('Checking the outline in immersive reading mode...');
  await page.locator('[data-reader-toggle]').first().click();
  await page.waitForFunction(() => document.body.dataset.readerMode === 'immersive' && !document.querySelector('[data-note-toc-stage]').classList.contains('has-reading-rail'));
  const outline = page.locator('[data-note-toc]');
  if (!await outline.isVisible() || await outline.evaluate(node => node.inert)) throw new Error('Immersive outline is hidden or inert');
  const bodyBox = await page.locator('.post-content').boundingBox();
  const tocBox = await outline.boundingBox();
  if (tocBox.x < bodyBox.x + bodyBox.width || tocBox.x + tocBox.width > 2560) throw new Error('Immersive outline overlaps the article or viewport');
  await outline.locator('a[href^="#"]').nth(1).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-mobile-toc-fab]').click();
  await page.waitForSelector('.mobile-toc-sheet.is-open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.mobile-toc-sheet.is-open'));
  if (await page.locator('body').getAttribute('data-reader-mode') !== 'immersive') throw new Error('Closing the outline also exited reader mode');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForFunction(() => !document.body.dataset.readerMode);

  assert.deepEqual(errors, []);
  console.log('TOC article checks passed (rail, immersive outline and mobile sheet).');
} finally {
  await browser.close();
}
