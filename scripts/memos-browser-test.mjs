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
const fixture = await mkdtemp(path.join(tmpdir(), 'daybook-memos-browser-'));
const publicDir = path.join(fixture, 'public');
const exec = promisify(execFile);
let server;
let browser;

async function write(relative, text) {
  const filename = path.join(fixture, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, text);
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

async function settled(page, kind) {
  await page.waitForFunction(kind => document.body.dataset.pageKind === kind, kind);
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-transitioning'));
}

async function visibleCards(page, expected) {
  await page.waitForFunction(expected => {
    const actual = [...document.querySelectorAll('[data-memo-card]')]
      .filter(card => !card.hidden)
      .map(card => card.dataset.memoUrl).sort();
    return JSON.stringify(actual) === JSON.stringify([...expected].sort());
  }, expected);
}

const alpha = '/memos/alpha-record/';
const beta = '/memos/beta-record/';
const gamma = '/memos/gamma-record/';

try {
  await write('daybook.yaml', 'site:\n  url: https://example.com\nprofile:\n  author:\n    logoText: Memos Test\n    avatar: /attachments/picture/1.svg\nstats:\n  enabled: true\ncomment:\n  enabled: true\n  provider: giscus\n  giscus:\n    repo: Test/comments\n    repoId: R_test\n    category: Announcements\n    categoryId: DIC_test\n');
  await write('vault/pages/about.md', '---\ntitle: About\n---\nMemos browser fixture.\n');
  await write('vault/notes/reference.md', '---\ndate: 2026-10-01\n---\nA reference note linking to [[memos/alpha-record]].\n');
  await write('vault/memos/alpha-record.md', `---
date: 2026-10-02T18:30:00+08:00
updated: 2026-10-03T10:15:00+08:00
tags: [reading, shared]
location: Riverside
---
A **boldword** and *gentleword* with [anchorword](/notes/reference/).[^1]

${Array.from({ length: 6 }, (_, index) => `![Photo ${index + 1}](/attachments/picture/${index + 1}.svg)`).join('\n\n')}

[^1]: Alpha footnote text.
`);
  await write('vault/memos/beta-record.md', `---
date: 2026-10-02T09:00:00+08:00
tags: [walking, shared]
location: Garden
pinned: true
---
Morning steps and another footnote.[^1]

:::gallery
![Garden one](/attachments/picture/1.svg)
![Garden two](/attachments/picture/2.svg)
:::

[^1]: Beta footnote text.
`);
  await write('vault/memos/gamma-record.md', `---
date: 2026-09-30
tags: [reading]
---
Last month's library visit.

![A single landscape](/attachments/picture/1.svg)

A portrait between paragraphs.

![A single portrait](/attachments/picture/portrait.svg)
`);
  await write('vault/attachments/picture/portrait.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="600"><rect width="100" height="600" fill="gray"/></svg>');
  for (let i = 1; i <= 6; i++) {
    await write(`vault/attachments/picture/${i}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${i * 40} 40% 50%)"/><text x="40" y="80" font-size="40">Photo ${i}</text></svg>`);
  }

  const binary = path.join(fixture, process.platform === 'win32' ? 'daybook.exe' : 'daybook');
  await exec('go', ['build', '-o', binary, './cmd/daybook'], { cwd: root, timeout: 120000 });
  await exec(binary, ['build'], { cwd: fixture, timeout: 120000 });
  server = createServer(async (request, response) => {
    try {
      let filename = path.resolve(publicDir, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (!filename.startsWith(publicDir + path.sep) && filename !== publicDir) {
        response.writeHead(403).end();
        return;
      }
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      response.setHeader('Content-Type', contentTypes[path.extname(filename)] || 'application/octet-stream');
      response.end(await readFile(filename));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const hits = [];
  const commentRequests = [];
  await context.route('**/api/hit', async route => {
    const { path } = route.request().postDataJSON();
    hits.push(path);
    await route.fulfill({ json: { path, pageViews: 43, totalViews: 100, visitors: 5 } });
  });
  await context.route('**/api/stats?*', async route => {
    await route.fulfill({ json: { path: new URL(route.request().url()).searchParams.get('path'), pageViews: 42 } });
  });
  await context.route('**/api/likes?*', async route => {
    const paths = new URL(route.request().url()).searchParams.getAll('path');
    await route.fulfill({ json: { items: paths.map(path => ({ path, count: 7, liked: false })) } });
  });
  await context.route('https://giscus.app/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/discussions') {
      commentRequests.push(url.searchParams.get('term'));
      assert.equal(url.searchParams.get('strict'), 'true');
      assert.equal(url.searchParams.get('session'), null, 'Public counts never forward login credentials');
      if (url.searchParams.get('term') === beta) await route.fulfill({ status: 404, json: { error: 'Discussion not found' } });
      else if (url.searchParams.get('term') === gamma) await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
      else await route.fulfill({ json: { discussion: { totalCommentCount: 2, totalReplyCount: 3 } } });
    } else {
      await route.fulfill({ contentType: 'text/html', body: `<script>parent.postMessage({giscus:{resizeHeight:320}},'*')</script>Mock comments` });
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/notes/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__memosDocument = document; });
  await page.locator('.side-nav a[href="/memos/"]').click();
  await settled(page, 'memos');
  await page.waitForSelector('.memos-aside [data-memos-calendar] button');
  await visibleCards(page, [beta, alpha, gamma]);
  assert(await page.evaluate(() => window.__memosDocument === document), 'Notes → memos uses the existing SPA document');

  assert.equal(await page.locator(`[data-memo-url="${beta}"] [data-ui-aria="memos.pinned"]`).count(), 1, 'Pinned memo has a marker and precedes newer ordinary entries');

  console.log('Checking memo search fields and safe highlights...');
  const search = page.locator('[data-memos-search]');
  const alphaCard = page.locator(`[data-memo-url="${alpha}"]`);
  assert.equal(await alphaCard.locator('.memo-updated time').textContent(), '2026-10-03');
  await page.waitForFunction(() => document.querySelector('[data-memo-url="/memos/alpha-record/"] [data-comment-count]')?.textContent === '5');
  assert.equal(await alphaCard.locator('.memo-actions > *').count(), 5, 'Five actions share the footer');
  assert.equal(await alphaCard.locator('.memo-permalink .material-symbol').count(), 0, 'Dates have no external-link icon');
  assert.equal(await alphaCard.locator('[data-memo-views]').textContent(), '42');
  assert.equal(await page.locator(`[data-memo-url="${beta}"] [data-comment-count]`).textContent(), '0', 'An absent discussion has zero comments');
  assert(!hits.some(path => path.startsWith('/memos/') && path !== '/memos/'), 'Reading the feed does not record a visit to each memo');
  assert.equal(await alphaCard.evaluate(el => getComputedStyle(el).cursor), 'pointer');
  assert.equal(await alphaCard.locator('.memo-avatar').evaluate(el => getComputedStyle(el).borderRadius), '8px');
  assert(await alphaCard.locator('.memo-number, [data-like-count]').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return style.fontFamily.includes('Cormorant Garamond') && style.fontStyle === 'italic';
  })), 'All post dates and counters use italic Cormorant Garamond');
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root: fontRoot } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: fontRoot.nodeId, selector: '.memo-permalink time' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  assert(fonts.some(font => font.isCustomFont && /CormorantGaramond.*Italic/i.test(font.postScriptName)), 'Dates render the actual Cormorant Garamond italic font file');
  assert.equal(await alphaCard.locator('.memo-updated > span').textContent(), 'updated');
  assert(await alphaCard.locator('.memo-updated > span').evaluate(el => { const style = getComputedStyle(el); return style.fontFamily.includes('Cormorant Garamond') && style.fontStyle === 'italic' && parseFloat(style.fontSize) >= 16; }), 'Updated uses the enlarged italic metadata face');
  const background = await alphaCard.evaluate(el => getComputedStyle(el).backgroundColor);
  await alphaCard.hover();
  assert.equal(await alphaCard.evaluate(el => getComputedStyle(el).backgroundColor), background, 'Hover does not highlight the post');
  assert(await page.locator('.memos-aside [data-memos-calendar] button, .memos-aside [data-memos-tags] small').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).fontStyle === 'normal')), 'Calendar and tag counts keep normal type');
  const typography = await alphaCard.evaluate(card => {
    const body = getComputedStyle(card.querySelector('.memo-content'));
    return [...card.querySelectorAll('.memo-tag, .memo-location')].every(node => {
      const style = getComputedStyle(node);
      return style.fontSize === body.fontSize && style.lineHeight === body.lineHeight;
    });
  });
  assert(typography, 'Memo tags and location match body font size and line height');
  await alphaCard.locator('em').evaluate(element => { window.__memoEm = element; });
  await alphaCard.locator('a[href="/notes/reference/"]').evaluate(element => { window.__memoLink = element; });
  for (const [query, expected] of [
    ['gentleword', [alpha]], ['alpha-record', [alpha]], ['Riverside', [alpha]],
    ['2026-09-30', [gamma]], ['walking', [beta]], ['unfindable-token', []],
  ]) {
    await search.fill(query);
    await visibleCards(page, expected);
    if (query === 'gentleword') {
      assert.equal(await alphaCard.locator('em').textContent(), 'gentleword');
      assert(await page.evaluate(() => Boolean(CSS.highlights?.get('memo-search')?.size) || Boolean(document.querySelector('.memo-search-highlight'))), 'Visible body matches are highlighted');
    }
  }
  await search.fill('anchorword');
  await visibleCards(page, [alpha]);
  assert.equal(await alphaCard.locator('a[href="/notes/reference/"]').textContent(), 'anchorword');
  assert(await page.evaluate(() => window.__memoEm.isConnected && window.__memoLink.isConnected), 'Search preserves emphasis and link nodes');
  await search.fill('');
  await visibleCards(page, [beta, alpha, gamma]);

  console.log('Checking calendar and tag intersection, month navigation and reset...');
  const sidebar = page.locator('.memos-aside');
  await sidebar.locator('[data-memos-date="2026-10-02"]').click();
  await visibleCards(page, [beta, alpha]);
  await sidebar.locator('[data-memo-tag="reading"]').click();
  await visibleCards(page, [alpha]);
  await page.locator('[data-memos-reset]').click();
  await visibleCards(page, [beta, alpha, gamma]);
  assert.equal(await sidebar.locator('button[aria-pressed="true"]').count(), 0, 'Reset clears both calendar and tag state');
  await sidebar.locator('[data-memos-month="-1"]').click();
  await sidebar.locator('[data-memos-select-month]').click();
  await visibleCards(page, [gamma]);
  assert.equal(new URL(page.url()).searchParams.get('month'), '2026-09', 'The month filter has a shareable URL');
  await page.locator('[data-memos-reset]').click();
  await sidebar.locator('[data-memos-date="2026-09-30"]').click();
  await visibleCards(page, [gamma]);
  await page.locator('[data-memos-reset]').click();
  await visibleCards(page, [beta, alpha, gamma]);

  console.log('Checking multiple tags and dates...');
  await sidebar.locator('[data-memo-tag="reading"]').click();
  await sidebar.locator('[data-memo-tag="walking"]').click({ modifiers: ['Control'] });
  await visibleCards(page, [alpha, beta, gamma]);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['reading', 'walking']);
  await sidebar.locator('[data-memos-month="1"]').click();
  await sidebar.locator('[data-memos-date="2026-10-02"]').click();
  await sidebar.locator('[data-memos-month="-1"]').click();
  await sidebar.locator('[data-memos-date="2026-09-30"]').click({ modifiers: ['Control'] });
  await visibleCards(page, [alpha, beta, gamma]);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('date'), ['2026-10-02', '2026-09-30']);
  await sidebar.locator('[data-memo-tag="walking"]').click({ modifiers: ['Control'] });
  await visibleCards(page, [alpha, gamma]);
  await sidebar.locator('[data-memos-date="2026-09-30"]').click({ modifiers: ['Control'] });
  await visibleCards(page, [alpha]);
  await page.locator('[data-memos-reset]').click();
  await visibleCards(page, [alpha, beta, gamma]);

  console.log('Checking independent footnote anchors across memo cards...');
  const fragments = await page.locator('[data-memo-card] .memo-content').evaluateAll(contents => contents.flatMap(content =>
    [...content.querySelectorAll('a[href^="#"]')].map(link => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const target = document.getElementById(id);
      return { id, local: Boolean(target && content.contains(target)), count: [...document.querySelectorAll('[id]')].filter(node => node.id === id).length };
    })));
  assert(fragments.length >= 4, 'Both repeated footnotes supply reference and return links');
  assert(fragments.every(fragment => fragment.local && fragment.count === 1), 'Each footnote reference and return anchor stays inside its own memo');

  console.log('Checking four-image preview and full detail through SPA navigation...');
  const visibleImages = await alphaCard.locator('.memo-content img').evaluateAll(images => images.filter(image => getComputedStyle(image).display !== 'none' && image.getClientRects().length > 0).length);
  assert.equal(visibleImages, 4, 'A memo preview displays at most four of its six images');
  assert.equal(await alphaCard.locator('.memo-more-photos').count(), 1, 'Additional images have a link to the full memo');
  const morePhotos = alphaCard.locator('.memo-more-photos');
  assert.equal(await morePhotos.locator('.memo-photo-count').textContent(), '+2');
  const photoBounds = await alphaCard.locator('.has-more-photos').boundingBox();
  const badgeBounds = await morePhotos.boundingBox();
  assert(Math.abs(badgeBounds.y - photoBounds.y - 8) < 1 && Math.abs(photoBounds.x + photoBounds.width - badgeBounds.x - badgeBounds.width - 8) < 1, 'The badge stays in the top-right corner');
  async function checkSingleImageLimits() {
    await page.locator(`[data-memo-url="${gamma}"] .memo-content img`).evaluateAll(images => Promise.all(images.map(image => {
      image.loading = 'eager';
      return image.decode();
    })));
    const sizes = await page.locator(`[data-memo-url="${gamma}"] .memo-content`).evaluate(content => {
      const width = (content.getBoundingClientRect().width - 8) / 2;
      return [...content.querySelectorAll('img')].map(image => {
        const bounds = image.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, maxWidth: width, maxHeight: width * .75 };
      });
    });
    assert.equal(sizes.length, 2);
    assert(sizes.every(size => size.width > 0 && size.width <= size.maxWidth + 1 && size.height > 0 && size.height <= size.maxHeight + 1), `Standalone images must fit within one grid cell: ${JSON.stringify(sizes)}`);
  }
  await checkSingleImageLimits();
  assert.equal(await alphaCard.locator('.memo-photo-tile').nth(3).locator('.memo-more-photos').count(), 1, 'The extra-image badge belongs to the fourth image');
  assert.equal(await alphaCard.locator('figcaption').first().evaluate(element => getComputedStyle(element).position), 'absolute', 'Feed captions overlay the image');
  await morePhotos.focus();
  assert.equal(await morePhotos.locator('.memo-photo-hint').evaluate(element => getComputedStyle(element).opacity), '1', 'Keyboard focus reveals the extra-image hint');
  await morePhotos.evaluate(element => element.blur());
  await alphaCard.locator('.memo-photo-tile').nth(3).hover();
  assert.equal(await morePhotos.locator('.memo-photo-hint').evaluate(element => getComputedStyle(element).opacity), '1', 'Hover reveals the extra-image hint');
  await search.fill('gentleword');
  await visibleCards(page, [alpha]);
  await sidebar.locator('[data-memo-tag="reading"]').click();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'gentleword');
  assert.equal(new URL(page.url()).searchParams.get('tag'), 'reading');
  const feedBounds = await alphaCard.boundingBox();
  await alphaCard.locator('.memo-more-photos').click();
  await settled(page, 'memo');
  assert.equal(new URL(page.url()).pathname, alpha);
  const detailBounds = await page.locator('.memo-detail-post').boundingBox();
  assert(Math.abs(feedBounds.x - detailBounds.x) < 2 && Math.abs(feedBounds.width - detailBounds.width) < 2, 'Detail keeps the feed column position and width');
  assert.equal(await page.locator('[data-reader-toggle], [data-reader-exit], .reading-time, [data-mobile-progress-text]').count(), 0, 'Memo detail has no reader mode or reading-time controls');
  assert.equal(await page.locator('.memo-updated time').textContent(), '2026-10-03');
  assert.equal(await page.locator('.article-meta-rows, .note-header').count(), 0, 'Memo detail has no article metadata section');
  assert.equal(await page.locator('.memo-detail-post .memo-actions > *').count(), 5);
  assert.equal(await page.locator('.memo-detail-page > #comments').count(), 1, 'Comments follow the shared post');
  assert.equal(await page.locator('.post-content img').count(), 6, 'The detail page preserves all original images');
  assert.equal(await page.locator('.memo-photo-tile, .memo-more-photos').count(), 0, 'Feed image treatment does not leak into detail');
  assert.equal(await page.locator('.post-content figcaption').first().evaluate(element => getComputedStyle(element).position), 'static', 'Detail captions use normal Markdown styling');
  assert(await page.evaluate(() => window.__memosDocument === document), 'Memos → detail retains the SPA document');
  await page.goBack();
  await settled(page, 'memos');
  await visibleCards(page, [alpha]);
  assert.equal(await search.inputValue(), 'gentleword', 'Browser back restores the memo query');
  assert.equal(await sidebar.locator('[data-memo-tag="reading"]').getAttribute('aria-pressed'), 'true', 'Browser back restores the tag filter');
  assert(await page.evaluate(() => window.__memosDocument === document), 'Browser back restores memos within the SPA');
  await page.locator('[data-memos-reset]').click();
  await visibleCards(page, [beta, alpha, gamma]);

  const betaGallery = page.locator(`[data-memo-url="${beta}"] .md-gallery`);
  assert.equal(await betaGallery.locator('.md-carousel-track').count(), 0, 'Authored galleries use the feed image grid');
  await page.locator(`[data-memo-url="${beta}"] .memo-permalink`).click();
  await settled(page, 'memo');
  await page.waitForSelector('.md-gallery .md-carousel-track');
  assert.equal(await page.locator('.memo-photo-grid').count(), 0, 'Detail restores the normal Markdown gallery');
  await page.locator('.memo-detail-back').click();
  await settled(page, 'memos');

  await alphaCard.locator('a[href="/notes/reference/"]').click();
  await settled(page, 'note');
  await page.locator('[data-reader-toggle]').click();
  assert.equal(await page.locator('body').getAttribute('data-reader-mode'), 'immersive');
  await page.locator('.post-content a').click();
  await settled(page, 'memo');
  assert.equal(await page.locator('body').getAttribute('data-reader-mode'), null, 'Entering a memo clears reader mode');
  await page.locator('.memo-detail-back').click();
  await settled(page, 'memos');
  await visibleCards(page, [beta, alpha, gamma]);

  await alphaCard.locator('.memo-content > p').first().click({ position: { x: 2, y: 2 } });
  await settled(page, 'memo');
  assert.equal(new URL(page.url()).pathname, alpha, 'Clicking ordinary post content opens its detail');
  await page.locator('.memo-comment-action').click();
  await page.waitForFunction(() => location.hash === '#comments');
  await page.waitForSelector('#giscus iframe');
  const widget = page.frames().find(frame => frame.url().startsWith('https://giscus.app/'));
  assert.equal(new URL(widget.url()).searchParams.get('emitMetadata'), '1');
  await widget.evaluate(() => parent.postMessage({ giscus: { discussion: { totalCommentCount: 3, totalReplyCount: 4 } } }, '*'));
  await page.waitForFunction(() => document.querySelector('[data-comment-count]')?.textContent === '7');
  await page.locator('.memo-detail-back').click();
  await settled(page, 'memos');
  await page.locator(`[data-memo-url="${gamma}"]`).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-memo-url="/memos/gamma-record/"] [data-memo-views]')?.textContent === '42');
  assert.equal(await page.locator(`[data-memo-url="${gamma}"] [data-comment-count]`).textContent(), '—', 'Failed comment counts stay unknown');

  console.log('Checking mobile shared overlay focus, close controls and filter state...');
  await page.setViewportSize({ width: 390, height: 844 });
  // Let the responsive grid and its container-query units settle after resize.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await checkSingleImageLimits();
  const opener = page.locator('.memos-filter-toggle');
  const overlay = page.locator('#mobile-tags-overlay');
  await opener.click();
  await page.waitForFunction(() => document.body.classList.contains('is-tags-overlay-open'));
  assert.equal(await page.locator('#mobile-overlay-container').getAttribute('aria-hidden'), 'false');
  assert.equal(await opener.getAttribute('aria-expanded'), 'true');
  await page.waitForFunction(() => document.activeElement === document.querySelector('#mobile-tags-overlay [data-overlay-close]'), null, { timeout: 2000 });
  assert(await page.locator('.page-frame main').evaluate(element => element.inert), 'An open mobile memo overlay makes background content inert');
  await page.keyboard.press('Shift+Tab');
  assert(await overlay.evaluate(element => element.contains(document.activeElement) && document.activeElement !== element.querySelector('[data-overlay-close]')), 'Reverse Tab wraps to the last overlay control');
  await page.keyboard.press('Tab');
  assert(await overlay.locator('[data-overlay-close]').evaluate(element => document.activeElement === element), 'Tab wraps back to the first overlay control');
  await overlay.locator('[data-memo-tag="walking"]').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('is-tags-overlay-open'));
  assert(await opener.evaluate(element => document.activeElement === element), 'Escape returns focus to the opener');
  assert.equal(await page.locator('#mobile-overlay-container').getAttribute('aria-hidden'), 'true');
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  await visibleCards(page, [beta]);
  await opener.click();
  assert.equal(await overlay.locator('[data-memo-tag="walking"]').getAttribute('aria-pressed'), 'true', 'Reopening preserves the selected filter');
  await overlay.locator('[data-overlay-close]').click();
  await page.waitForFunction(() => !document.body.classList.contains('is-tags-overlay-open'));
  assert(await opener.evaluate(element => document.activeElement === element), 'The close button restores opener focus');
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Closing unlocks page scrolling');
  await page.locator('[data-memos-reset]').click();
  await visibleCards(page, [beta, alpha, gamma]);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Memos remain within the mobile viewport');

  assert(await alphaCard.locator('.memo-actions').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'The five actions fit on mobile');
  const requestCount = commentRequests.length;
  await page.evaluate(() => {
    document.documentElement.dataset.commentsDisabled = 'true';
    document.dispatchEvent(new CustomEvent('daybook:settings-change', { detail: { useSystemCursor: true } }));
  });
  await page.waitForTimeout(150);
  assert.equal(commentRequests.length, requestCount, 'Disabling comments stops count requests');
  console.log('Checking touch long-press selection and URL restoration...');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await opener.click();
  const longPress = async locator => {
    const box = await locator.boundingBox();
    const touchPoints = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await overlay.locator('[data-memo-tag="reading"]').tap();
  await longPress(overlay.locator('[data-memo-tag="walking"]'));
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['reading', 'walking']);
  // Move to October, then select another date in September using a long press.
  if (!(await overlay.locator('[data-memos-date="2026-10-02"]').count())) await overlay.locator('[data-memos-month="1"]').tap();
  await overlay.locator('[data-memos-date="2026-10-02"]').tap();
  await overlay.locator('[data-memos-month="-1"]').tap();
  await longPress(overlay.locator('[data-memos-date="2026-09-30"]'));
  assert.deepEqual(new URL(page.url()).searchParams.getAll('date'), ['2026-10-02', '2026-09-30']);
  await longPress(overlay.locator('[data-memo-tag="walking"]'));
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['reading']);
  const movingTag = await overlay.locator('[data-memo-tag="walking"]').boundingBox();
  const point = { x: movingTag.x + movingTag.width / 2, y: movingTag.y + movingTag.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 30, y: point.y }] });
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['reading'], 'Dragging cancels a pending long press');
  await overlay.locator('[data-overlay-close]').tap();
  await visibleCards(page, [alpha, gamma]);
  await page.reload({ waitUntil: 'networkidle' });
  await visibleCards(page, [alpha, gamma]);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('date'), ['2026-10-02', '2026-09-30'], 'Repeated date filters survive reload');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const before = await alphaCard.boundingBox();
    await alphaCard.locator('.memo-permalink').click();
    await settled(page, 'memo');
    const after = await page.locator('.memo-detail-post').boundingBox();
    assert(Math.abs(before.x - after.x) < 2 && Math.abs(before.width - after.width) < 2, `Detail preserves the feed column at ${width}px`);
    await page.locator('.memo-detail-back').click();
    await settled(page, 'memos');
  }
  assert.deepEqual(errors, [], 'Memos interactions have no uncaught browser errors');
  await context.close();
  console.log('Memos browser tests passed: search, highlights, calendar, tags, images, footnotes, SPA and mobile overlays.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(fixture, { recursive: true, force: true });
}
