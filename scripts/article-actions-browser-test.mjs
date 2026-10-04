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
      let token = /daybook_visitor=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/hit') {
        // Make sure likes waits for the existing statistics identity bootstrap.
        await new Promise(resolve => setTimeout(resolve, 40));
        if (!token) res.setHeader('Set-Cookie', `daybook_visitor=${crypto.randomUUID()}; Path=/; HttpOnly; SameSite=Lax`);
        res.end(JSON.stringify({ path: '/notes/example/', pageViews: 1, totalViews: 1, visitors: 1 }));
        return;
      }
      if (url.pathname !== '/api/likes') { res.writeHead(404).end('{}'); return; }
      assert(token, 'Likes requests wait for the visitor Cookie');
      let paths = url.searchParams.getAll('path');
      if (req.method === 'PUT') {
        writes++;
        if (failNext) { failNext = false; res.writeHead(503).end('{}'); return; }
        let body = '';
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        paths = [input.path];
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
  const like = page.locator('[data-like-path]');
  await ready(like, false, 0);
  await like.click();
  await ready(like, true, 1);
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
  await page.waitForFunction(() => document.querySelector('.rss-status').textContent === '已复制');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), base + '/rss.xml');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.evaluate(dialog => dialog.open), false);
  assert(await opener.evaluate(link => document.activeElement === link));
  await page.locator('.site-tools .lang-toggle').click();
  await page.locator('.article-stagger-meta [data-rss-open]').click();
  assert.equal(await page.locator('#rss-title').textContent(), 'Subscribe to this site (RSS)');
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
  console.log('Article actions passed: identity bootstrap, likes, retries, revisits, memos, SPA, RSS, clipboard, language and mobile.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(fixture, { recursive: true, force: true });
}
