import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.DAYBOOK_TEST_URL || 'http://localhost:1313';
const browser = await chromium.launch({ headless: true });
const errors = [];
const contexts = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function createPage(options = {}, settings = { useSystemCursor: true }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(settings => {
    localStorage.setItem('daybook:user-settings', JSON.stringify(settings));
    document.addEventListener('daybook:page-load', event => {
      window.committedPath = new URL(event.detail.newUrl).pathname;
    });
  }, settings);
  await page.goto(`${base}/notes/`);
  await page.waitForFunction(() => typeof window.daybookNavigate === 'function');
  await settled(page);
  return page;
}
async function settled(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-transitioning'));
}
async function navigate(page, path) {
  await page.evaluate(path => { window.daybookNavigate(path); }, path);
}
async function arrived(page, path) {
  await page.waitForURL(`${base}${path}`);
  await page.waitForFunction(path => window.committedPath === path, path);
  await settled(page);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-navigation-pending'));
}
async function busy(page, expected = true) {
  await page.waitForFunction(expected => (document.documentElement.dataset.navigationLoading === 'true') === expected, expected);
}
async function hold(page, path, action = 'continue', type = 'fetch') {
  let release, started;
  const released = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  const match = url => url.pathname === path;
  const handler = async route => {
    if (route.request().resourceType() !== type) return route.continue();
    started();
    await released;
    try {
      if (action === 'fail') await route.fulfill({ status: 503, body: 'Unavailable' });
      else await route.continue();
    } catch { /* An intentionally cancelled request may already be disposed. */ }
  };
  await page.route(match, handler);
  return { requested, release, remove: () => page.unroute(match, handler) };
}

try {
  console.log('Navigation loading: native progress, cancellation, history, failures');
  const page = await createPage();
  const article = await page.locator('[data-note-card] a[data-title-transition-key]').first().getAttribute('href');
  assert(article, 'Smoke vault has an article');
  let gate = await hold(page, article);
  const oldTitle = await page.title();
  await page.locator(`a[data-title-transition-key="${article}"]`).click();
  await gate.requested;
  await busy(page);
  assert.equal(await page.title(), oldTitle, 'Old page stays readable during the request');
  assert.equal(await page.locator('[data-daybook-page]').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('a').first().evaluate(el => getComputedStyle(el).cursor), 'progress');
  gate.release();
  await arrived(page, article);
  await busy(page, false);
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0);
  await gate.remove();

  gate = await hold(page, '/notes/');
  await page.evaluate(() => history.back());
  await gate.requested;
  await busy(page);
  gate.release();
  await arrived(page, '/notes/');
  await gate.remove();
  const index = await page.evaluate(() => history.state.index);
  const oldRequest = await hold(page, '/about/');
  const newRequest = await hold(page, article);
  await navigate(page, '/about/');
  await oldRequest.requested;
  await busy(page);
  await navigate(page, article);
  await newRequest.requested;
  oldRequest.release();
  await sleep(80);
  assert.equal(await page.locator('html').getAttribute('data-navigation-loading'), 'true', 'Old cleanup cannot clear a new busy state');
  newRequest.release();
  await arrived(page, article);
  assert.equal(await page.evaluate(() => history.state.index), index + 1, 'Cancelled navigation does not consume a history index');
  await oldRequest.remove();
  await newRequest.remove();

  // Interrupt the intentional exit delay after resources are ready.
  await navigate(page, '/about/');
  await page.waitForFunction(() => document.body.classList.contains('page-exiting'));
  await navigate(page, '/notes/');
  await arrived(page, '/notes/');
  assert.equal(await page.evaluate(() => history.state.index), index + 2);

  // Fast warmed navigation must not flash the indicator.
  await page.evaluate(() => {
    window.loadingFlashed = false;
    new MutationObserver(() => {
      if (document.documentElement.dataset.navigationLoading === 'true') window.loadingFlashed = true;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-navigation-loading'] });
  });
  await navigate(page, article);
  await arrived(page, article);
  assert.equal(await page.evaluate(() => window.loadingFlashed), false);

  gate = await hold(page, '/about/', 'fail');
  await page.evaluate(() => {
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('loadingAtUnload', document.documentElement.dataset.navigationLoading || 'false');
    });
  });
  await navigate(page, '/about/');
  await gate.requested;
  await busy(page);
  gate.release();
  await page.waitForURL(`${base}/about/`);
  await page.waitForLoadState();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('loadingAtUnload')), 'false', 'Native fallback clears the indicator');
  await gate.remove();

  console.log('Navigation loading: pending page assets and timeout fallback');
  const traversePage = await createPage();
  await navigate(traversePage, article);
  await arrived(traversePage, article);
  const backGate = await hold(traversePage, '/notes/');
  await traversePage.evaluate(() => history.back());
  await backGate.requested;
  await busy(traversePage);
  await navigate(traversePage, '/about/');
  await arrived(traversePage, '/about/');
  assert.equal(await traversePage.evaluate(() => history.state.index), 1, 'A new push uses the traversed history index even before its DOM arrives');
  backGate.release();
  await backGate.remove();

  const assetsPage = await createPage();
  const manifest = await (await fetch(`${base}/assets-manifest.json`)).json();
  const scriptGate = await hold(assetsPage, manifest['/js/code-copy.js'], 'continue', 'script');
  await navigate(assetsPage, article);
  await scriptGate.requested;
  await busy(assetsPage);
  scriptGate.release();
  await arrived(assetsPage, article);
  await scriptGate.remove();
  const cssGate = await hold(assetsPage, manifest['/css/bundles/home.css'], 'continue', 'stylesheet');
  await navigate(assetsPage, '/');
  await cssGate.requested;
  await busy(assetsPage);
  cssGate.release();
  await arrived(assetsPage, '/');
  await cssGate.remove();

  // Accelerate only the timeout, after the indicator is visibly running.
  const timeoutPage = await createPage();
  await timeoutPage.clock.install();
  const timeoutGate = await hold(timeoutPage, '/about/');
  await navigate(timeoutPage, '/about/');
  await timeoutGate.requested;
  await timeoutPage.clock.fastForward(450);
  await busy(timeoutPage);
  await timeoutPage.clock.fastForward(15000);
  await timeoutPage.waitForURL(`${base}/about/`);
  await timeoutPage.waitForLoadState();
  assert.equal(await timeoutPage.locator('html').getAttribute('data-navigation-loading'), null);
  timeoutGate.release();
  await timeoutGate.remove();

  console.log('Navigation loading: liquid playback, settings and responsive cursor');
  const custom = await createPage({}, { useSystemCursor: false });
  await custom.mouse.move(550, 160);
  await custom.waitForSelector('html.has-custom-cursor');
  gate = await hold(custom, article);
  await navigate(custom, article);
  await busy(custom);
  await custom.waitForSelector('.daybook-cursor.is-loading .daybook-cursor__liquid');
  const shape = custom.locator('.daybook-cursor__liquid path');
  const initialPath = await shape.getAttribute('d');
  await sleep(350);
  assert.notEqual(await shape.getAttribute('d'), initialPath, 'Liquid plays even with a stationary pointer');
  await custom.mouse.move(720, 330);
  await custom.waitForFunction(() => getComputedStyle(document.querySelector('.daybook-cursor')).transform.includes('720, 330'));
  const position = await custom.locator('.daybook-cursor').evaluate(el => getComputedStyle(el).transform);
  assert(position.includes('720, 330'), 'Outer cursor follows the actual pointer');
  for (const palette of ['default', 'warm']) for (const theme of ['light', 'dark']) {
    await custom.evaluate(({ palette, theme }) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.theme = theme;
    }, { palette, theme });
    assert(await shape.evaluate(el => getComputedStyle(el).fill !== 'none'));
  }
  await custom.setViewportSize({ width: 850, height: 900 });
  await custom.waitForSelector('.daybook-cursor', { state: 'detached' });
  assert.notEqual(await custom.locator('body').evaluate(el => getComputedStyle(el).cursor), 'none', '769–960px retains the system cursor');
  await custom.waitForFunction(() => document.querySelector('[data-navigation-logo]').textContent === 'Waiting...');
  await custom.setViewportSize({ width: 1440, height: 900 });
  await custom.mouse.move(740, 350);
  await custom.waitForSelector('.daybook-cursor.is-loading .daybook-cursor__liquid');
  await custom.emulateMedia({ reducedMotion: 'reduce' });
  await custom.waitForSelector('.daybook-cursor', { state: 'detached' });
  assert.equal(await custom.locator('body').evaluate(el => getComputedStyle(el).cursor), 'progress');
  await custom.emulateMedia({ reducedMotion: 'no-preference' });
  await custom.mouse.move(750, 355);
  await custom.waitForSelector('.daybook-cursor.is-loading .daybook-cursor__liquid');
  // The in-app preference also takes effect immediately during a request.
  await custom.evaluate(() => { document.documentElement.dataset.reducedMotion = 'true'; });
  await custom.waitForSelector('.daybook-cursor', { state: 'detached' });
  await custom.evaluate(() => { delete document.documentElement.dataset.reducedMotion; });
  await custom.mouse.move(760, 360);
  await custom.waitForSelector('.daybook-cursor.is-loading .daybook-cursor__liquid');
  gate.release();
  await arrived(custom, article);
  assert.equal(await custom.locator('.daybook-cursor.is-loading').count(), 0);
  await gate.remove();
  await custom.locator('.persistent-logo').click();
  await custom.waitForSelector('#settings-overlay.is-open');
  await custom.locator('#setting-system-cursor').hover();
  assert.notEqual(await custom.locator('#setting-system-cursor').evaluate(el => getComputedStyle(el).cursor), 'none', 'Settings retain the native cursor when the custom cursor is hidden');
  await custom.keyboard.press('Escape');

  console.log('Navigation loading: mobile label, top bar, reduced motion and interrupted entry');
  const mobile = await createPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const originalLogo = await mobile.locator('[data-navigation-logo]').textContent();
  const menu = await mobile.locator('#mobile-menu-toggle').boundingBox();
  gate = await hold(mobile, article);
  await mobile.evaluate(() => document.body.classList.add('mobile-top-bar-hidden'));
  await navigate(mobile, article);
  await busy(mobile);
  await mobile.waitForFunction(() => document.querySelector('[data-navigation-logo]').textContent === 'Waiting...');
  assert.equal((await mobile.locator('.navigation-progress').boundingBox()).height, 2);
  const busyMenu = await mobile.locator('#mobile-menu-toggle').boundingBox();
  assert.equal(busyMenu.x, menu.x, 'Label replacement does not shift the menu');
  assert(busyMenu.y >= 0, 'Loading reveals a hidden top bar');
  assert.equal(await mobile.locator('[data-navigation-logo]').evaluate(el => getComputedStyle(el).fontStyle), 'italic');
  const segments = mobile.locator('.navigation-progress span');
  const strokes = await segments.evaluateAll(elements => {
    // Compare visible geometry at one shared instant, regardless of whether
    // the motion uses transforms or independently animated endpoints.
    const animations = elements.flatMap(el => el.getAnimations());
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 900;
    }
    const bounds = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    });
    for (const animation of animations) animation.play();
    return bounds;
  });
  assert(strokes.every(stroke => stroke.width > 0), 'Both strokes appear during their overlap');
  assert.notDeepEqual(strokes[0], strokes[1], 'The two strokes have staggered motion');
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  for (const segment of await segments.all()) assert.equal(await segment.evaluate(el => getComputedStyle(el).animationName), 'none');
  gate.release();
  await arrived(mobile, article);
  await mobile.waitForFunction(text => document.querySelector('[data-navigation-logo]').textContent === text, originalLogo);
  await gate.remove();

  await mobile.emulateMedia({ reducedMotion: 'no-preference' });
  await mobile.evaluate(() => { document.body.dataset.readerMode = 'immersive'; });
  gate = await hold(mobile, '/notes/');
  await navigate(mobile, '/notes/');
  await busy(mobile);
  assert.equal(await mobile.locator('.persistent-logo-container').evaluate(el => getComputedStyle(el).display), 'block', 'Immersive reading still exposes loading feedback');
  // Finish while Waiting... is still entering, then begin another request.
  gate.release();
  await arrived(mobile, '/notes/');
  await gate.remove();
  gate = await hold(mobile, article);
  await navigate(mobile, article);
  await busy(mobile);
  // The configured logo can be longer than Daybook; its stagger determines
  // the duration, so do not assume a fixed 850ms completion time.
  await mobile.waitForFunction(() => document.querySelector('[data-navigation-logo]').textContent === 'Waiting...');
  assert.equal(await mobile.locator('[data-navigation-logo]').textContent(), 'Waiting...', 'Old text timers cannot restore the logo during a new wait');
  gate.release();
  await arrived(mobile, article);
  await mobile.waitForFunction(text => document.querySelector('[data-navigation-logo]').textContent === text, originalLogo);
  assert.equal(await mobile.locator('[data-navigation-logo]').evaluate(el => el.style.minWidth), '');
  await gate.remove();

  // The extracted text roller must retain the original share interaction.
  await mobile.evaluate(() => { navigator.clipboard.writeText = async text => { window.copiedText = text; }; });
  await mobile.locator('[data-share-open]').first().click();
  const copyLabel = mobile.locator('.share-copy-text');
  const originalCopy = await copyLabel.textContent();
  const copiedLabel = await copyLabel.getAttribute('data-text-copied-zh');
  await mobile.locator('[data-share-copy]').click();
  await mobile.waitForFunction(text => document.querySelector('.share-copy-text').textContent === text, copiedLabel);
  assert(await mobile.evaluate(() => window.copiedText.length > 0));
  await mobile.waitForFunction(text => document.querySelector('.share-copy-text').textContent === text, originalCopy);

  assert.deepEqual(errors, []);
  console.log('Navigation loading browser checks passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
