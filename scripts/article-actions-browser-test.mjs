import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await mkdtemp(path.join(tmpdir(), 'daybook-actions-'));
const output = path.join(fixture, 'public');
const exec = promisify(execFile);
let server, browser;
const likes = new Map();
let writes = 0, failNext = false;
const hits = [];
let privacyWrites = 0;
let visitorCount = 0;
async function write(file, contents) {
  const dest = path.join(fixture, file);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, contents);
}
async function settled(page, kind) {
  await page.waitForFunction(kind => document.body.dataset.pageKind === kind && !document.documentElement.classList.contains('is-transitioning'), kind);
}
async function ready(button, pressed, count) {
  await button.page().waitForFunction(({ path, pressed, count }) => {
    const button = [...document.querySelectorAll('[data-like-path]')].find(button => button.dataset.likePath === path);
    return button && !button.disabled && button.getAttribute('aria-pressed') === String(pressed) && button.querySelector('[data-like-count]').textContent === String(count);
  }, { path: await button.getAttribute('data-like-path'), pressed, count });
}
try {
  await write('daybook.yaml', 'site:\n  url: https://example.com\nstats:\n  enabled: true\nprofile:\n  author:\n    logoText: Actions Test\n');
  await write('vault/pages/about.md', '---\ntitle: About\n---\nAbout.');
  await write('vault/notes/example.md', '---\ndate: 2026-10-03\n---\nAn article with [a short memo](/memos/随记/).');
  await write('vault/memos/随记.md', '---\ndate: 2026-10-03T10:00:00+08:00\ntags: [日常]\nlocation: 公园\n---\n记录一段日常。 [Read the note](/notes/example/).');
  const binary = path.join(fixture, 'daybook');
  await exec('go', ['build', '-o', binary, './cmd/daybook'], { cwd: root });
  await exec(binary, ['build'], { cwd: fixture });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/rss+xml' };
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let token = /daybook_engagement=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/privacy') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { analytics } = JSON.parse(body);
        privacyWrites++;
        res.setHeader('Set-Cookie', analytics
          ? `daybook_analytics=${crypto.randomUUID()}; Path=/; HttpOnly; SameSite=Lax`
          : 'daybook_analytics=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
        res.end(JSON.stringify({ version: 1, analytics }));
        return;
      }
      if (url.pathname === '/api/hit') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        hits.push({ ...input, cookie: req.headers.cookie || '' });
        if (input.analytics) visitorCount = 1;
        res.end(JSON.stringify({ path: input.path, pageViews: 1, totalViews: 1, visitors: visitorCount }));
        return;
      }
      if (url.pathname !== '/api/likes') { res.writeHead(404).end('{}'); return; }
      let paths = url.searchParams.getAll('path');
      if (req.method === 'PUT') {
        writes++;
        if (failNext) { failNext = false; res.writeHead(503).end('{}'); return; }
        let body = '';
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        paths = [input.path];
        if (!token && input.liked) {
          token = crypto.randomUUID();
          res.setHeader('Set-Cookie', `daybook_engagement=${token}; Path=/; HttpOnly; SameSite=Lax`);
        }
        const records = likes.get(input.path) || new Set();
        if (input.liked) records.add(token); else records.delete(token);
        likes.set(input.path, records);
      }
      res.end(JSON.stringify({ items: paths.map(path => ({ path, count: likes.get(path)?.size || 0, liked: Boolean(likes.get(path)?.has(token)) })) }));
      return;
    }
    try {
      let file = path.resolve(output, '.' + decodeURI(url.pathname));
      if (!file.startsWith(output + path.sep) && file !== output) { res.writeHead(403).end(); return; }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  let presenceSocket;
  await context.routeWebSocket(/\/api\/presence\?/, socket => { presenceSocket = socket; });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/notes/example/');
  const privacy = page.locator('.privacy-content');
  await page.waitForFunction(() => document.querySelector('#privacy-overlay').open);
  assert.equal(await page.locator('#privacy-analytics').isChecked(), false);
  assert.equal(await page.locator('#privacy-necessary').isChecked(), true);
  assert.equal(await page.locator('.privacy-paper').evaluate(el => getComputedStyle(el).width), await page.locator('#settings-overlay .settings-paper').evaluate(el => getComputedStyle(el).width));
  await page.waitForFunction(() => document.querySelector('[data-like-path]').dataset.likeReady === 'true');
  assert.equal((await context.cookies()).length, 0, 'No identity before consent or first like');
  assert.equal(hits[0].analytics, false);
  assert.equal(hits[0].cookie, '');
  await page.screenshot({ path: '/tmp/daybook-privacy-desktop.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => localStorage.getItem('daybook:privacy:v1')), null, 'Escape does not consent');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#privacy-overlay').open);
  await privacy.locator('[data-privacy-necessary]').check();
  await privacy.locator('[data-privacy-save]').click();
  await page.waitForFunction(() => !document.querySelector('#privacy-overlay').open && !document.querySelector('#settings-overlay').classList.contains('is-open'));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('daybook:privacy:v1'))), { analytics: false });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-like-path]').dataset.likeReady === 'true');
  assert.equal(await page.locator('#privacy-overlay').evaluate(dialog => dialog.open), false, 'Saved choices suppress the first-visit prompt');
  await page.locator('.persistent-logo').click();
  const settingsPaper = page.locator('#settings-overlay .settings-paper');
  const originalPaper = await settingsPaper.boundingBox();
  await page.locator('[data-privacy-open]').click();
  assert.equal(await page.locator('#privacy-overlay').evaluate(el => el.open), false, 'Settings keeps its original overlay');
  assert.deepEqual(await settingsPaper.boundingBox(), originalPaper, 'Paper stays still when privacy opens');
  await page.screenshot({ path: '/tmp/daybook-settings-privacy.png' });
  await page.locator('[data-privacy-details]').click();
  await page.locator('[data-privacy-back]').click();
  await page.locator('[data-privacy-settings-back]').click();
  assert.equal(await page.locator('[data-settings-page]').isVisible(), true);
  assert.deepEqual(await settingsPaper.boundingBox(), originalPaper, 'Returning keeps the original paper geometry');
  assert(await page.locator('[data-privacy-open]').evaluate(el => document.activeElement === el));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-privacy-open]').click();
  assert(await page.locator('.privacy-content').evaluate(el => el.getAnimations().length > 0), 'Content animates independently of the paper');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#privacy-analytics').check();
  assert.equal(await page.locator('#privacy-necessary').isChecked(), false);
  await page.locator('#privacy-analytics').uncheck();
  assert.equal(await page.locator('#privacy-necessary').isChecked(), true, 'Unchecking statistics returns to necessary only');
  await page.locator('#privacy-analytics').check();
  assert.equal(await privacy.locator('#privacy-analytics + svg polyline').evaluate(el => getComputedStyle(el).animationName), 'dash');
  await privacy.locator('[data-privacy-save]').click();
  await page.waitForFunction(() => !document.querySelector('#privacy-overlay').open && !document.querySelector('#settings-overlay').classList.contains('is-open'));
  assert((await context.cookies()).some(cookie => cookie.name === 'daybook_analytics'));
  await page.waitForTimeout(80);
  assert.equal(hits.at(-1).analytics, true);
  assert.equal(hits.at(-1).countView, false, 'Granting consent does not add another page view');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const like = page.locator('[data-like-path]');
  await ready(like, false, 0);
  await like.click();
  await ready(like, true, 1);
  const secondTab = await context.newPage();
  await secondTab.goto(base + '/notes/example/');
  await ready(secondTab.locator('[data-like-path]'), true, 1);
  await page.locator('.persistent-logo').click();
  await page.locator('[data-privacy-open]').click();
  assert.equal(await page.locator('#privacy-analytics').isChecked(), true);
  await privacy.locator('[data-privacy-necessary]').check();
  await privacy.locator('[data-privacy-save]').click();
  await page.waitForFunction(() => !document.querySelector('#privacy-overlay').open && !document.querySelector('#settings-overlay').classList.contains('is-open'));
  await secondTab.waitForFunction(() => JSON.parse(localStorage.getItem('daybook:privacy:v1')).analytics === false);
  await page.waitForTimeout(100);
  assert(!(await context.cookies()).some(cookie => cookie.name === 'daybook_analytics'));
  assert((await context.cookies()).some(cookie => cookie.name === 'daybook_engagement'));
  assert.equal(hits.at(-1).analytics, false);
  assert.equal(hits.at(-1).cookie, '', 'Aggregate hits do not transmit the engagement Cookie');
  await secondTab.close();
  await page.reload();
  await ready(like, true, 1);
  assert.equal(writes, 1, 'Revisiting never adds a like');
  await like.click();
  await ready(like, false, 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const beforeFailure = await page.locator('.article-stagger-meta').boundingBox();
  failNext = true;
  await like.click();
  await page.waitForFunction(() => document.querySelector('[data-like-feedback="error"]'));
  await ready(like, false, 0);
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon).animationName), 'like-reject');
  assert.deepEqual(await page.locator('.article-stagger-meta').boundingBox(), beforeFailure, 'Failure does not resize or move metadata');
  assert.equal(await page.locator('[data-like-entry]').innerText(), 'favorite\n0', 'No visible error text');
  await like.click();
  await ready(like, true, 1);
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon).animationName), 'like-confirm');
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon, '::before').animationName), 'like-ripple');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon).animationName), 'none');
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon, '::before').animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { document.documentElement.dataset.reducedMotion = 'true'; });
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon, '::before').animationName), 'none');
  await page.evaluate(() => { delete document.documentElement.dataset.reducedMotion; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('[data-like-feedback]'));
  assert.equal(await like.getAttribute('aria-label'), '取消喜欢');
  assert.equal(await page.locator('.like-status').count(), 0, 'Feedback never inserts inline status text');

  await page.locator('.side-nav a[href="/memos/"]').click();
  await settled(page, 'memos');
  await ready(like, false, 0);
  await like.click();
  await ready(like, true, 1);
  await page.locator('.memo-permalink').click();
  await settled(page, 'memo');
  await ready(like, true, 1);
  await like.click();
  await ready(like, false, 0);
  await page.goBack();
  await settled(page, 'memos');
  await ready(like, false, 0);
  const otherContext = await browser.newContext();
  await otherContext.addInitScript(() => localStorage.setItem('daybook:privacy:v1', JSON.stringify({ analytics: false })));
  const other = await otherContext.newPage();
  await other.goto(base + '/notes/example/');
  await ready(other.locator('[data-like-path]'), false, 1);
  await otherContext.close();

  // Global and article entries all point to the same site-wide feed.
  await page.goto(base + '/notes/example/');
  await ready(like, true, 1);
  const entries = page.locator('.site-tools [data-rss-open], .article-stagger-meta [data-rss-open]');
  assert.equal(await entries.count(), 2);
  assert.deepEqual(await entries.evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/rss.xml', '/rss.xml']);
  const opener = page.locator('.site-tools [data-rss-open]');
  await opener.click();
  const dialog = page.locator('#rss-dialog');
  assert.equal(await dialog.evaluate(dialog => dialog.open), true);
  assert.equal(await dialog.locator('[data-rss-address]').inputValue(), base + '/rss.xml');
  await dialog.locator('[data-rss-copy]').click();
  await page.waitForFunction(() => document.querySelector('[data-rss-copy-text]').textContent === '已复制');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), base + '/rss.xml');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.evaluate(dialog => dialog.open), false);
  assert(await opener.evaluate(link => document.activeElement === link));
  await page.locator('.site-tools .lang-toggle').click();
  await page.locator('.article-stagger-meta [data-rss-open]').click();
  assert.equal(await page.locator('#rss-title').textContent(), 'Subscribe to this site (RSS)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const copyLayout = await page.evaluate(async () => {
    await document.fonts.ready;
    const button = document.querySelector('[data-rss-copy]');
    const label = button.querySelector('[data-rss-copy-text]');
    const samples = [];
    button.click();
    const start = performance.now();
    while (performance.now() - start < 2500) {
      await new Promise(requestAnimationFrame);
      const rect = button.getBoundingClientRect();
      const first = label.querySelector('.text-roll-new')?.firstChild || label.firstChild;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(first, first.nodeType === Node.TEXT_NODE ? 1 : 0);
      samples.push({ left: rect.left, width: rect.width, textLeft: range.getBoundingClientRect().left, rolling: label.classList.contains('text-roll-active') });
    }
    return { samples, text: label.textContent };
  });
  assert(copyLayout.samples.some(sample => sample.rolling), 'RSS copy uses the shared rolling animation');
  for (const key of ['left', 'width', 'textLeft']) {
    const values = copyLayout.samples.map(sample => sample[key]);
    assert(Math.max(...values) - Math.min(...values) < 0.5, `RSS copy ${key} stays stable through animation cleanup and reset`);
  }
  assert.equal(copyLayout.text, 'Copy address');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Denied'); }; });
  await dialog.locator('[data-rss-copy]').click();
  await page.waitForFunction(() => document.querySelector('.rss-status').textContent.includes('selected'));
  assert(await dialog.locator('[data-rss-address]').evaluate(input => input.selectionEnd === input.value.length && input.selectionStart === 0));
  await page.screenshot({ path: '/tmp/daybook-actions-desktop.png' });
  await page.keyboard.press('Escape');
  const feed = await (await context.request.get(base + '/rss.xml')).text();
  assert.match(feed, /\/notes\/example\//);
  assert.match(feed, /\/memos\/随记\//);

  await page.setViewportSize({ width: 390, height: 844 });
  // Wait for the responsive reflow and font loading before measuring layout.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const mobileMeta = await page.locator('.article-stagger-meta').boundingBox();
  failNext = true;
  await like.click();
  await page.waitForFunction(() => document.querySelector('[data-like-feedback="error"]'));
  await ready(like, true, 1);
  assert.deepEqual(await page.locator('.article-stagger-meta').boundingBox(), mobileMeta, 'Mobile failure keeps metadata layout stable');
  assert.equal(await like.locator('.material-symbol').evaluate(icon => getComputedStyle(icon).animationName), 'none');
  assert.equal(await page.locator('.like-status').count(), 0);
  await page.locator('.article-stagger-meta [data-rss-open]').click();
  assert(await dialog.evaluate(dialog => { const r = dialog.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  await page.screenshot({ path: '/tmp/daybook-actions-mobile.png' });
  await page.keyboard.press('Escape');
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-drawer [data-rss-open]').click();
  assert.equal(await dialog.evaluate(dialog => dialog.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-mobile-drawer-open')), true, 'RSS Escape does not close the underlying drawer');
  console.log('Checking note/memo flips and archive count-up animation...');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base + '/notes/example/');
  await ready(like, true, 1);
  await page.evaluate(() => delete document.documentElement.dataset.reducedMotion);
  const assertFlipping = async selector => {
    const counter = page.locator(selector).first();
    assert.equal(await counter.locator('.number-flip-current').evaluate(el => getComputedStyle(el).animationName), 'number-flip-in');
    assert.equal(await counter.evaluate(el => getComputedStyle(el, '::before').animationName), 'number-flip-out');
    return counter;
  };
  presenceSocket.send(JSON.stringify({ type: 'presence', path: '/notes/example/', pageViewers: 9, siteViewers: 99 }));
  await page.waitForFunction(() => document.querySelector('[data-page-viewers]')?.textContent === '9');
  await assertFlipping('[data-page-viewers]');
  presenceSocket.send(JSON.stringify({ type: 'presence', path: '/notes/example/', pageViewers: 10, siteViewers: 100 }));
  await page.waitForFunction(() => document.querySelector('[data-page-viewers]')?.textContent === '10');
  assert.equal(await page.locator('[data-page-viewers]').getAttribute('data-number-previous'), '9', 'Rapid updates flip from the latest confirmed value');
  await page.waitForTimeout(500);
  presenceSocket.send(JSON.stringify({ type: 'presence', path: '/notes/example/', pageViewers: 10, siteViewers: 100 }));
  await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-page-viewers].is-number-flipping').count(), 0, 'An unchanged count does not animate');
  await like.click(); await ready(like, false, 0);
  await assertFlipping('[data-like-count]');
  await page.goto(base + '/memos/');
  const memoLike = page.locator('[data-like-path]');
  await ready(memoLike, false, 0);
  await memoLike.click(); await ready(memoLike, true, 1);
  await assertFlipping('[data-like-count]');
  await page.goto(base + '/archive/');
  await page.waitForFunction(() => document.querySelector('[data-site-visitors-anim]')?.textContent === '1');
  await page.evaluate(() => {
    document.querySelectorAll('.archive-stat-num').forEach(el => el.classList.remove('anim-done'));
    document.querySelector('[data-site-visitors-anim]').dataset.target = '1200';
    document.querySelector('[data-site-views-anim]').dataset.target = '42000';
    document.dispatchEvent(new Event('daybook:stats-loaded'));
  });
  await page.waitForFunction(() => {
    const value = Number(document.querySelector('[data-site-visitors-anim]').textContent.replaceAll(',', ''));
    return value > 0 && value < 1200;
  });
  assert.equal(await page.locator('.archive-stat-num.number-flip').count(), 0, 'Archive uses the original count-up, not a flip');
  await page.waitForFunction(() => document.querySelector('[data-site-visitors-anim]').textContent === '1,200' && document.querySelector('[data-site-views-anim]').textContent === '42.0');
  assert.equal(await page.locator('[data-site-visitors-anim]').textContent(), '1,200');
  assert.equal(await page.locator('[data-site-views-anim]').textContent(), '42.0');
  presenceSocket.send(JSON.stringify({ type: 'presence', path: '/archive/', pageViewers: 1, siteViewers: 17 }));
  await page.waitForFunction(() => document.querySelector('[data-site-viewers]')?.textContent === '17');
  assert.equal(await page.locator('[data-site-viewers].number-flip').count(), 0);
  for (const preference of ['system', 'setting']) {
    await page.emulateMedia({ reducedMotion: preference === 'system' ? 'reduce' : 'no-preference' });
    await page.evaluate(preference => {
      if (preference === 'setting') document.documentElement.dataset.reducedMotion = 'true';
      document.querySelector('[data-site-visitors-anim]').classList.remove('anim-done');
      document.querySelector('[data-site-visitors-anim]').dataset.target = preference === 'system' ? '2' : '3';
      document.dispatchEvent(new Event('daybook:stats-loaded'));
    }, preference);
    assert.equal(await page.locator('[data-site-visitors-anim]').textContent(), preference === 'system' ? '2' : '3', 'Reduced motion updates archive counters immediately');
  }
  assert.deepEqual(errors, []);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await mobile.routeWebSocket(/\/api\/presence\?/, () => {});
  const phone = await mobile.newPage();
  await phone.goto(base + '/en_US/notes/example/');
  await phone.waitForFunction(() => document.querySelector('#privacy-overlay').open);
  assert.equal(await phone.locator('#privacy-title').innerText(), 'Privacy');
  const saveBounds = await phone.locator('[data-privacy-save]').boundingBox();
  const contentBounds = await phone.locator('.privacy-content').boundingBox();
  assert(saveBounds.y >= contentBounds.y && saveBounds.y + saveBounds.height <= contentBounds.y + contentBounds.height + 1, 'Mobile first page exposes the choices and save action without scrolling');
  await phone.screenshot({ path: '/tmp/daybook-privacy-mobile.png' });
  await phone.locator('#privacy-analytics').check();
  assert.equal(await phone.locator('#privacy-analytics + svg polyline').evaluate(el => getComputedStyle(el).animationName), 'none');
  await phone.locator('[data-privacy-details]').click();
  assert.equal(await phone.locator('[data-privacy-main]').isVisible(), false);
  assert.equal(await phone.locator('[data-privacy-detail-page]').isVisible(), true);
  await phone.setViewportSize({ width: 320, height: 568 });
  await phone.locator('[data-privacy-back]').scrollIntoViewIfNeeded();
  const paper = await phone.locator('.privacy-paper').boundingBox();
  assert(paper.x >= 0 && paper.y >= 0 && paper.x + paper.width <= 320 && paper.y + paper.height <= 568, 'Expanded mobile paper fits the viewport');
  await phone.screenshot({ path: '/tmp/daybook-privacy-mobile-details.png' });
  await phone.locator('[data-privacy-back]').click();
  assert.equal(await phone.locator('#privacy-analytics').isChecked(), true, 'Details preserves the draft');
  await phone.locator('[data-privacy-close]').last().click();
  assert.equal(await phone.evaluate(() => localStorage.getItem('daybook:privacy:v1')), null, 'Closing a checked draft never grants consent');
  assert(!(await mobile.cookies()).some(cookie => cookie.name === 'daybook_analytics'));
  await phone.locator('.persistent-logo').click();
  await phone.locator('[data-privacy-open]').click();
  assert.equal(await phone.locator('#privacy-analytics').isChecked(), false, 'Reopening discards an unsaved draft');
  await phone.keyboard.press('Tab');
  assert(await phone.evaluate(() => document.querySelector('#settings-overlay').contains(document.activeElement)), 'Keyboard focus remains in the modal');
  await phone.keyboard.press('Escape');
  assert(await phone.locator('.persistent-logo').evaluate(el => document.activeElement === el), 'Closing restores focus to Settings');
  await mobile.close();

  const unavailable = await browser.newContext();
  await unavailable.route('**/api/privacy', route => route.fulfill({ status: 404, body: '{}' }));
  let unsafeRequests = 0;
  unavailable.on('request', req => { if (/\/api\/(hit|likes|presence)/.test(req.url())) unsafeRequests++; });
  const offline = await unavailable.newPage();
  await offline.goto(base + '/notes/example/');
  await offline.waitForFunction(() => document.querySelector('#privacy-overlay').open);
  await offline.locator('[data-privacy-save]').click();
  await offline.waitForFunction(() => document.querySelector('.privacy-status').textContent.length > 0);
  assert.equal(unsafeRequests, 0, 'Old or unavailable backends cannot create identities');
  await offline.keyboard.press('Escape');
  await offline.locator('.side-nav a[href="/memos/"]').click();
  await settled(offline, 'memos');
  assert.equal(unsafeRequests, 0, 'Browsing remains usable with runtime APIs paused');
  await unavailable.close();

  const noStorage = await browser.newContext();
  await noStorage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
    Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
  });
  await noStorage.routeWebSocket(/\/api\/presence\?/, () => {});
  const temporary = await noStorage.newPage();
  await temporary.goto(base + '/notes/example/');
  await temporary.waitForFunction(() => document.querySelector('#privacy-overlay').open);
  await temporary.locator('[data-privacy-save]').click();
  await temporary.waitForFunction(() => !document.querySelector('#privacy-overlay').open && !document.querySelector('#settings-overlay').classList.contains('is-open'));
  await temporary.locator('.side-nav a[href="/memos/"]').click();
  await settled(temporary, 'memos');
  assert.equal(await temporary.locator('#privacy-overlay').evaluate(el => el.open), false, 'In-memory choice survives SPA navigation with storage blocked');
  await noStorage.close();
  assert(privacyWrites > 0);
  console.log('Article actions and privacy passed: consent, withdrawal, cross-tab sync, storage failures, backend compatibility, likes, SPA, RSS, keyboard, language and mobile.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(fixture, { recursive: true, force: true });
}
