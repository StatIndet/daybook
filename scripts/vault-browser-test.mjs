import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Optional integration checks against an actual external vault. check.sh keeps
// using its own portable fixture and never depends on this user's notes.
const baseURL = process.env.DAYBOOK_TEST_BASE_URL || process.argv[2] || 'http://127.0.0.1:1415';
const outputDir = process.env.DAYBOOK_TEST_OUTPUT_DIR || '/tmp/daybook-vault-browser';
const testFilter = process.env.DAYBOOK_TEST_FILTER && new RegExp(process.env.DAYBOOK_TEST_FILTER);
const fixtureTitles = {
  toc: process.env.DAYBOOK_TEST_TOC_TITLE || 'Markdown、Obsidian 与 Daybook 语法',
  zh: process.env.DAYBOOK_TEST_ZH_TITLE || '静夜思',
  en: process.env.DAYBOOK_TEST_EN_TITLE || 'Thoughts in a Quiet Night',
};
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

async function createPage(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/hit', route => {
    const data = route.request().postDataJSON();
    return route.fulfill({ json: { path: data.path, pageViews: 1, totalViews: 1, visitors: 1 } });
  });
  await page.routeWebSocket('**/api/presence*', socket => {
    const sendPresence = pathname => socket.send(JSON.stringify({ type: 'presence', path: pathname, pageViewers: 1, siteViewers: 1 }));
    sendPresence(new URL(socket.url()).searchParams.get('path') || '/');
    socket.onMessage(message => { try { sendPresence(JSON.parse(String(message)).path || '/'); } catch {} });
  });
  await page.addInitScript(() => {
    window.__daybookTransitions = [];
    const avatar = () => {
      const element = document.querySelector('[data-site-avatar]');
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { name: getComputedStyle(element).viewTransitionName, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    if (document.startViewTransition) {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = update => {
        const record = { oldURL: location.href, oldAvatar: avatar() };
        window.__daybookTransitions.push(record);
        return original(async () => {
          await update();
          record.newURL = location.href;
          record.newAvatar = avatar();
        });
      };
    }
    const NativeDate = Date;
    let offset = 0;
    window.Date = class extends NativeDate {
      constructor(...arguments_) { super(...(arguments_.length ? arguments_ : [NativeDate.now() + offset])); }
      static now() { return NativeDate.now() + offset; }
    };
    window.__daybookAdvanceDay = () => { offset += 86400000; };
  });
  return { page, context, errors };
}

async function settled(page, pageKind) {
  if (pageKind) await page.waitForFunction(kind => document.body.dataset.pageKind === kind, pageKind);
  // Traversal updates the URL before the router fetches and swaps the page.
  // Wait for the recorded swap too, even when both pages have the same kind.
  await page.waitForFunction(() => {
    const latest = window.__daybookTransitions.at(-1);
    return !latest || latest.newURL === location.href;
  });
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-transitioning'));
  await page.evaluate(() => document.fonts.ready);
}

async function navigate(page, pathname, kind) {
  await page.evaluate(route => window.daybookNavigateTo(route), pathname);
  await page.waitForFunction(route => location.pathname === route, pathname);
  await settled(page, kind);
}

async function noteLinks(page) {
  return page.locator('.notes-item-title a').evaluateAll(links => links.map(link => ({
    title: link.textContent.replace(/\s+/g, ' ').trim(),
    path: new URL(link.href).pathname,
  })));
}

async function saveHomeScreenshots(page, mobile = false) {
  const device = mobile ? 'mobile' : 'desktop';
  await page.screenshot({ path: path.join(outputDir, `home-${device}-full.png`), fullPage: true });
  await page.screenshot({ path: `/tmp/daybook-home-${device}.png` });
}

async function run(name, callback) {
  if (testFilter && !name.startsWith('discover ') && !testFilter.test(name)) return;
  try { results.push({ name, ...(await callback()), passed: true }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}

let fixtures;
await run('discover canonical bilingual fixtures', async () => {
  const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
  try {
    await page.goto(`${baseURL}/notes/`, { waitUntil: 'networkidle' });
    const links = await noteLinks(page);
    fixtures = Object.fromEntries(Object.entries(fixtureTitles).map(([key, title]) => {
      const link = links.find(link => link.title === title);
      assert.ok(link, `Missing fixture '${title}'; override DAYBOOK_TEST_${key.toUpperCase()}_TITLE for another vault`);
      return [key, link.path];
    }));
    assert.ok(fixtures.zh.startsWith('/notes/'));
    assert.ok(fixtures.en.startsWith('/en_US/notes/'));
    await navigate(page, '/en_US/notes/', 'notes');
    const englishLinks = await noteLinks(page);
    assert.deepEqual(englishLinks.map(link => link.path).sort(), links.map(link => link.path).sort(), 'UI locale must show the same set of article versions');
    assert.deepEqual(errors, []);
    return { fixtures, listedVersions: links.length };
  } finally { await context.close(); }
});

if (fixtures) {
  await run('desktop: shared top-right tools and centered footer across SPA routes', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
      for (const [route, kind] of [['/', 'home'], ['/notes/', 'notes'], ['/archive/', 'archive'], ['/graph/', 'graph'], ['/about/', 'about'], [fixtures.toc, 'note']]) {
        await navigate(page, route, kind);
        assert.equal(await page.locator('.site-tools .notes-action-button').count(), 5);
        const tools = await page.locator('.site-tools').boundingBox();
        assert.ok(tools.y < 40 && tools.x > 1440 - 280);
        assert.equal(await page.locator('.notes-footer-links, .drawer-footer-row').count(), 0);
        assert.equal(await page.locator('.home-footer').count(), 1);
        const footer = await page.locator('.home-footer').boundingBox();
        assert.ok(Math.abs(footer.x + footer.width / 2 - 720) < 8);
        await page.locator('.site-tools [data-notes-tool="search"]').click();
        await page.locator('[data-notes-search]').fill('Markdown');
        if (kind === 'notes') await page.waitForSelector('.notes-search-results .notes-item');
        else await page.waitForSelector('[data-desktop-search-results] .notes-item');
        await page.keyboard.press('Escape');
        const searchStyle = await page.locator('.site-tools .notes-tools').evaluate(el => {
          const style = getComputedStyle(el);
          return { shadow: style.boxShadow, background: style.backgroundColor };
        });
        assert.equal(searchStyle.shadow, 'none');
        assert.equal(searchStyle.background, 'rgba(0, 0, 0, 0)');
        const scrollBefore = await page.evaluate(() => scrollY);
        await page.locator('.site-tools [data-mobile-overlay-target="tags"]').click();
        await page.waitForFunction(() => document.body.classList.contains('is-tags-overlay-open'));
        assert.ok(await page.locator('#mobile-tags-overlay .notes-tag-link').count() > 0);
        const tags = await page.locator('#mobile-tags-overlay .mobile-overlay-content').boundingBox();
        const center = await page.evaluate(() => document.body.getBoundingClientRect().width / 2);
        assert.ok(Math.abs(tags.x + tags.width / 2 - center) <= 1, 'Desktop tags must be centered in the viewport');
        assert.equal(await page.locator('.page-frame main').first().evaluate(el => el.inert), true);
        assert.equal(await page.locator('.page-frame main').first().evaluate(el => getComputedStyle(el).visibility), 'hidden');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.page-frame main').first().evaluate(el => el.inert), false);
        assert.equal(await page.evaluate(() => scrollY), scrollBefore);
        assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
        if (kind === 'about') {
          const original = await page.locator('.about-page').boundingBox();
          assert.equal(Math.round(original.x), 304, 'About must retain its original left alignment');
        }
      }
      await page.goBack();
      await settled(page, 'about');
      await page.goForward();
      await settled(page, 'note');
      await page.evaluate(() => scrollTo(0, 1800));
      await page.waitForFunction(() => scrollY >= 1790);
      const readingScroll = await page.evaluate(() => scrollY);
      await page.locator('.site-tools [data-mobile-overlay-target="tags"]').click();
      await page.locator('#mobile-tags-overlay [data-overlay-close]').click();
      assert.equal(await page.evaluate(() => scrollY), readingScroll, 'Closing tags must preserve reading position');
      await page.waitForFunction(() => document.querySelector('.note-toc-stage').classList.contains('is-reading'));
      const sticky = await page.locator('.note-toc-wrapper').boundingBox();
      assert.ok(Math.abs(sticky.y - 88) <= 1, `TOC must remain in view while reading: ${JSON.stringify(sticky)}`);
      const overlap = await page.evaluate(() => {
        const content = document.querySelector('.post-content').getBoundingClientRect();
        const rail = document.querySelector('.reading-toc-rail').getBoundingClientRect();
        return rail.left < content.right;
      });
      assert.equal(overlap, false, 'Reading rail overlaps article content');
      await page.locator('.site-tools [data-mobile-overlay-target="tags"]').click();
      const tag = page.locator('#mobile-tags-overlay [data-mobile-tag]').first();
      const tagRoute = new URL(await tag.getAttribute('href'), baseURL).pathname;
      await tag.click();
      await page.waitForFunction(route => location.pathname === route, tagRoute);
      await settled(page, 'tag');
      assert.equal(await page.locator('.page-frame main').first().evaluate(el => el.inert), false);
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.goBack();
      await settled(page, 'note');
      assert.equal(await page.locator('.site-tools [data-mobile-overlay-target="tags"]').getAttribute('aria-expanded'), 'false');
      assert.deepEqual(errors, []);
      return {};
    } finally { await context.close(); }
  });

  await run('desktop: TOC enters once during article navigation and stays in view', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/notes/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        window.__tocAnimations = [];
        document.addEventListener('animationstart', event => {
          if (event.target.matches('.note-toc-header')) {
            window.__tocAnimations.push({ name: event.animationName, transitioning: document.documentElement.classList.contains('is-transitioning') });
          }
        });
      });
      await page.locator(`.notes-item-title a[href="${fixtures.toc}"]`).click();
      await settled(page, 'note');
      await page.waitForTimeout(1200);
      const animations = await page.evaluate(() => window.__tocAnimations);
      assert.equal(animations.length, 1, `TOC header must enter exactly once: ${JSON.stringify(animations)}`);
      assert.equal(animations[0].transitioning, true, 'TOC must enter with the article rather than reappear after the transition');
      for (const top of [1000, 2000]) {
        await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top);
        const wrapper = await page.locator('.note-toc-wrapper').boundingBox();
        assert.ok(Math.abs(wrapper.y - 88) <= 1, `TOC is no longer sticky at ${top}px: ${JSON.stringify(wrapper)}`);
      }
      await page.locator('.note-toc-stage').hover();
      await page.waitForFunction(() => document.querySelector('.note-toc-stage').classList.contains('is-hovered'));
      assert.equal(await page.locator('.note-toc').getAttribute('aria-hidden'), null);
      assert.deepEqual(errors, []);
      return { animations };
    } finally { await context.close(); }
  });

  await run('graph: settings and query use opaque theme surfaces', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/graph/`, { waitUntil: 'networkidle' });
      await page.locator('#graph-settings-btn').click();
      await page.waitForFunction(() => !document.querySelector('.graph-panel').hidden);
      const backgrounds = await page.evaluate(() => {
        const originalTheme = document.documentElement.dataset.theme;
        const probe = document.createElement('div');
        probe.hidden = true;
        document.body.append(probe);
        const colors = ['light', 'dark'].map(theme => {
          document.documentElement.dataset.theme = theme;
          probe.style.backgroundColor = 'var(--color-paper)';
          const paper = getComputedStyle(probe).backgroundColor;
          probe.style.backgroundColor = 'var(--color-page)';
          return { theme, paper, page: getComputedStyle(probe).backgroundColor,
            panel: getComputedStyle(document.querySelector('.graph-panel')).backgroundColor,
            query: getComputedStyle(document.querySelector('#graph-search-input')).backgroundColor };
        });
        probe.remove();
        if (originalTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = originalTheme;
        return colors;
      });
      for (const colors of backgrounds) {
        assert.equal(colors.panel, colors.paper, `${colors.theme}: settings use the paper surface`);
        assert.equal(colors.query, colors.page, `${colors.theme}: query uses the page surface`);
        assert.notEqual(colors.panel, 'rgba(0, 0, 0, 0)');
        assert.notEqual(colors.query, 'rgba(0, 0, 0, 0)');
      }
      await page.locator('#graph-search-input').fill('Markdown');
      assert.ok(await page.locator('#graph-search-input').isVisible());
      assert.deepEqual(errors, []);
      return { backgrounds };
    } finally { await context.close(); }
  });

  await run('home mobile 390: bounded page and avatar', async () => {
    const { page, context, errors } = await createPage({ width: 390, height: 844 }, true);
    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
      await settled(page, 'home');
      await saveHomeScreenshots(page, true);
      const dimensions = await page.evaluate(() => {
        const image = document.querySelector('.hero-avatar');
        const nav = document.querySelector('.site-nav').getBoundingClientRect();
        return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, navHeight: nav.height, avatarLoaded: image.complete && image.naturalWidth > 0, avatarPriority: image.fetchPriority };
      });
      assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1, `Mobile homepage overflows horizontally: ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.avatarLoaded, 'GitHub avatar did not load');
      assert.equal(dimensions.avatarPriority, 'high');
      assert.deepEqual(errors, []);
      return dimensions;
    } finally { await context.close(); }
  });

  for (const width of [1280, 1440, 2560]) {
    await run(`desktop ${width}: TOC position and identity removal`, async () => {
      const { page, context, errors } = await createPage({ width, height: 1000 });
      try {
        await page.goto(`${baseURL}${fixtures.toc}`, { waitUntil: 'networkidle' });
        await settled(page, 'note');
        assert.equal(await page.locator('.notes-brand, .notes-aside-identity, .hero-name').count(), 0, 'Old sidebar identity must be removed');
        assert.equal(await page.locator('.post-content .note-toc, .note article > .note-toc').count(), 0, 'TOC must never interrupt article content');
        const layout = await page.evaluate(() => {
          const body = document.querySelector('.post-content').getBoundingClientRect();
          const toc = document.querySelector('.note-toc').getBoundingClientRect();
          const aside = document.querySelector('.notes-aside').getBoundingClientRect();
          return { article: { x: body.x, right: body.right, y: body.y, width: body.width }, toc: { x: toc.x, y: toc.y, width: toc.width, height: toc.height }, aside: { x: aside.x, y: aside.y } };
        });
        await page.screenshot({ path: path.join(outputDir, `article-${width}.png`) });
        // The root reserves a stable 10px scrollbar gutter on desktop.
        const viewportCenter = await page.evaluate(() => document.body.getBoundingClientRect().width / 2);
        assert.ok(Math.abs(layout.article.x + layout.article.width / 2 - viewportCenter) <= 1, `Article itself must be centered: ${JSON.stringify(layout)}`);
        assert.ok(layout.toc.width > 0, 'Desktop TOC must be visible');
        assert.ok(layout.toc.x >= layout.article.right - 2, `TOC is not to article's right: ${JSON.stringify(layout)}`);
        assert.ok(layout.toc.y < layout.article.y + 300, `TOC appears below article: ${JSON.stringify(layout)}`);
        const longHeading = await page.locator('.post-content h2, .post-content h3, .post-content h4').evaluateAll(headings => {
          const titles = headings.map(heading => {
            const content = heading.cloneNode(true);
            content.querySelectorAll('.heading-anchor').forEach(anchor => anchor.remove());
            return { id: heading.id, title: content.textContent.trim() };
          });
          return titles.find(heading => heading.title.length >= 16) || titles[0];
        });
        await page.evaluate(id => {
          const heading = document.getElementById(id);
          scrollTo({ top: heading.getBoundingClientRect().top + scrollY - 80, behavior: 'instant' });
        }, longHeading.id);
        await page.waitForFunction(() => document.querySelector('.note-toc-stage').classList.contains('is-reading'));
        await page.waitForTimeout(1200);
        const railLabel = await page.evaluate(() => {
          const root = document.querySelector('[data-reading-toc-rail]');
          const bounds = root.getBoundingClientRect();
          const curve = root.querySelector('[data-reading-toc-rail-base]').getBBox();
          const label = root.querySelector('[data-reading-toc-rail-label]').getBoundingClientRect();
          const title = root.querySelector('.reading-toc-rail-title.is-active');
          return { railLeft: bounds.left, railRight: bounds.right, curveRight: bounds.left + curve.x + curve.width, labelLeft: label.left, labelRight: label.right, titleWidth: title.getBoundingClientRect().width, title: title.textContent, alignment: getComputedStyle(title).textAlign };
        });
        assert.ok(railLabel.labelLeft >= railLabel.curveRight + 10, `Current heading must appear outside the right rail: ${JSON.stringify(railLabel)}`);
        assert.ok(railLabel.labelRight <= railLabel.railRight + 1, `Current heading is clipped by the rail edge: ${JSON.stringify(railLabel)}`);
        assert.ok(railLabel.titleWidth > 20, `Heading must retain readable width: ${JSON.stringify(railLabel)}`);
        assert.equal(railLabel.title, longHeading.title);
        assert.equal(railLabel.alignment, 'left');
        await page.screenshot({ path: path.join(outputDir, `reading-label-${width}.png`) });
        assert.deepEqual(errors, []);
        return { ...layout, railLabel };
      } finally { await context.close(); }
    });
  }

  for (const width of [961, 1100]) {
    await run(`compact ${width}: accessible TOC and fragment roundtrip`, async () => {
      const { page, context, errors } = await createPage({ width, height: 1000 });
      try {
        await page.goto(`${baseURL}${fixtures.toc}`, { waitUntil: 'networkidle' });
        await settled(page, 'note');
        assert.equal(await page.locator('.note-toc-wrapper').isVisible(), false, 'Compact viewport should expose one TOC entry point');
        await page.locator('[data-mobile-toc-fab]').click();
        await page.waitForFunction(() => document.querySelector('[data-mobile-toc-sheet]').classList.contains('is-open'));
        const box = await page.locator('.mobile-toc-panel').boundingBox();
        assert.ok(box.height <= 1000 * 0.85 + 2, 'Compact TOC exceeds viewport cap');
        const link = page.locator('[data-mobile-toc-sheet] nav a').nth(5);
        const id = decodeURIComponent((await link.getAttribute('href')).slice(1));
        await link.click();
        await page.waitForFunction(expected => {
          const heading = document.getElementById(expected);
          const top = heading.getBoundingClientRect().top;
          return decodeURIComponent(location.hash.slice(1)) === expected && top >= 0 && top < innerHeight / 2;
        }, id);
        assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
        assert.deepEqual(errors, []);
        return { tocSheetHeight: box.height, heading: id };
      } finally { await context.close(); }
    });
  }

  await run('home: shared link motion and unclipped tooltips across SPA navigation', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.github-repositories h2').count(), 0);
      assert.equal(await page.locator('.github-badge').filter({ hasText: /^Public$/ }).count(), 0);
      const navigation = page.locator('.site-nav .nav-link').first();
      await navigation.hover();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-nav .nav-link'), '::after').clipPath === 'inset(0px)');
      const highlight = await navigation.evaluate(element => getComputedStyle(element).color);
      for (const selector of ['.github-repository-heading a', '.github-followers a']) {
        const link = page.locator(selector).first();
        await link.hover();
        await page.waitForFunction(selector => {
          const element = document.querySelector(selector);
          return getComputedStyle(element, '::before').clipPath === 'inset(0px)' &&
            getComputedStyle(element.querySelector('.material-symbol')).fontVariationSettings.includes('"FILL" 1');
        }, selector);
        assert.equal(await link.evaluate(element => getComputedStyle(element).color), highlight);
      }
      for (const selector of ['.github-profile-details a']) {
        const link = page.locator(selector).first();
        await link.hover();
        await page.waitForFunction(({ selector, highlight }) => getComputedStyle(document.querySelector(selector)).color === highlight, { selector, highlight });
        assert.equal(await link.evaluate(element => getComputedStyle(element, '::before').content), 'none');
        assert.equal(await link.evaluate(element => getComputedStyle(element).color), highlight);
      }
      for (const icon of ['star', 'fork_right', 'open_in_new']) {
        const link = page.locator('.github-repository-meta a').filter({ has: page.locator('.material-symbol', { hasText: new RegExp(`^${icon}$`) }) }).first();
        assert.equal(await link.count(), 1, `missing repository ${icon} action`);
        await link.hover();
        await page.waitForFunction(icon => {
          const symbol = [...document.querySelectorAll('.github-repository-meta a .material-symbol')].find(element => element.textContent.trim() === icon);
          return getComputedStyle(symbol).fontVariationSettings.includes('"FILL" 1');
        }, icon);
        assert.equal(await link.evaluate(element => getComputedStyle(element, '::before').content), 'none');
        assert.equal(await link.evaluate(element => getComputedStyle(element).color), highlight);
      }
      const stars = page.locator('.github-repository-meta a').first();
      await stars.focus();
      await page.waitForFunction(() => document.querySelector('#home-tooltip')?.classList.contains('is-visible'));
      assert.equal(await page.locator('#home-tooltip').textContent(), 'Stars');
      assert.equal(await stars.getAttribute('aria-describedby'), 'home-tooltip');
      await page.keyboard.press('Escape');
      assert.equal(await stars.getAttribute('aria-describedby'), null);

      // Native upstream titles use the same tooltip; values remain plain text.
      await page.evaluate(() => {
        const link = document.createElement('a');
        link.href = '#readme';
        link.textContent = 'README link';
        link.title = '<img src=x onerror=alert(1)> & tooltip';
        document.querySelector('.github-readme-content').append(link);
        document.dispatchEvent(new Event('daybook:page-load'));
      });
      const upstream = page.locator('.github-readme-content a').last();
      await upstream.hover();
      await page.waitForFunction(expected => getComputedStyle(document.querySelector('.github-readme-content a')).color === expected, highlight);
      assert.equal(await upstream.evaluate(element => getComputedStyle(element, '::before').content), 'none');
      assert.equal(await upstream.evaluate(element => getComputedStyle(element).textDecorationLine), 'underline');
      assert.equal(await upstream.evaluate(element => getComputedStyle(element).color), highlight);
      assert.equal(await upstream.getAttribute('title'), null);
      assert.equal(await page.locator('#home-tooltip').textContent(), '<img src=x onerror=alert(1)> & tooltip');
      assert.equal(await page.locator('#home-tooltip img').count(), 0);

      const day = page.locator('.github-calendar-day').last();
      await day.hover();
      // Scroll events queued by hover's scrollIntoView must not dismiss the hint.
      await page.evaluate(() => document.querySelector('.github-calendar-scroll').dispatchEvent(new Event('scroll')));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#home-tooltip')).opacity === '1');
      assert.equal(await day.getAttribute('title'), null);
      assert.equal(await page.locator('#home-tooltip').textContent(), await day.getAttribute('data-tooltip'));
      const tooltip = await page.locator('#home-tooltip').boundingBox();
      const calendar = await page.locator('.github-calendar-scroll').boundingBox();
      assert.ok(tooltip.x >= 8 && tooltip.x + tooltip.width <= 1440 - 8);
      assert.ok(tooltip.y >= 8 && tooltip.y + tooltip.height <= 1000 - 8);
      assert.ok(tooltip.y >= calendar.y + calendar.height || tooltip.y + tooltip.height <= calendar.y + calendar.height, 'tooltip must escape the scrolling calendar');
      await page.screenshot({ path: path.join(outputDir, 'home-tooltip.png') });
      assert.equal(await page.locator('#home-tooltip.is-visible').count(), 1);
      await navigate(page, '/notes/', 'notes');
      assert.equal(await page.locator('#home-tooltip.is-visible').count(), 0);
      await page.locator('.notes-item-title a').first().hover();
      assert.equal(await page.locator('.notes-item-title a').first().evaluate(element => getComputedStyle(element, '::before').content), 'none');
      assert.equal(await page.locator('.notes-footer-links, .drawer-footer-row').count(), 0);
      await page.goBack();
      await settled(page, 'home');
      await page.locator('.github-calendar-day').first().hover();
      assert.equal(await page.locator('#home-tooltip.is-visible').count(), 1);
      assert.equal(await page.locator('#home-tooltip').count(), 1);
      assert.deepEqual(errors, []);
      return { tooltip, sharedHoverColor: highlight };
    } finally { await context.close(); }
  });

  await run('desktop UI language, counterpart and avatar snapshot transitions', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
      await saveHomeScreenshots(page);
      assert.equal(await page.locator('.site-tools .lang-toggle').getAttribute('href'), '/en_US/');
      await page.locator('.site-tools .lang-toggle').click();
      await page.waitForFunction(() => location.pathname === '/en_US/');
      await settled(page, 'home');
      const notes = page.locator('.site-nav a[href="/en_US/notes/"]');
      assert.equal(await notes.count(), 1, 'English Home must link /en_US/notes/');
      await notes.click();
      await page.waitForFunction(() => location.pathname === '/en_US/notes/');
      await settled(page, 'notes');
      assert.equal(new URL(page.url()).pathname, '/en_US/notes/');
      await navigate(page, fixtures.zh, 'note');
      const before = { title: await page.locator('.note-title').textContent(), text: await page.locator('.post-content').textContent(), path: new URL(page.url()).pathname };
      const oldLocale = await page.locator('html').getAttribute('lang');
      await page.locator('.notes-footer-actions .lang-toggle').click();
      await page.waitForFunction(old => document.documentElement.lang !== old, oldLocale);
      assert.equal(await page.locator('.note-title').textContent(), before.title);
      assert.equal(await page.locator('.post-content').textContent(), before.text, 'UI switch changed article content');
      assert.equal(new URL(page.url()).pathname, before.path, 'UI switch changed article route');
      assert.ok(new URL(page.url()).searchParams.has('ui'));
      const counterpart = page.locator('.bilingual-toggle-btn');
      assert.equal(await counterpart.getAttribute('href'), fixtures.en);
      assert.equal(await counterpart.locator('.material-symbol').textContent(), 'translate');
      await counterpart.click();
      await page.waitForFunction(expected => location.pathname === expected, fixtures.en);
      await settled(page, 'note');
      assert.equal(new URL(page.url()).pathname, fixtures.en);
      assert.notEqual(await page.locator('.post-content').textContent(), before.text, 'Counterpart did not change article text');
      await page.goBack();
      await page.waitForFunction(expected => location.pathname === expected, fixtures.zh);
      await settled(page, 'note');
      assert.equal(await page.locator('.post-content').textContent(), before.text);
      await page.goForward();
      await page.waitForFunction(expected => location.pathname === expected, fixtures.en);
      await settled(page, 'note');
      const transitions = await page.evaluate(() => window.__daybookTransitions);
      assert.ok(transitions.length >= 4, 'SPA transitions were not invoked');
      const homeToNotes = transitions.find(transition => new URL(transition.oldURL).pathname === '/en_US/' && new URL(transition.newURL).pathname === '/en_US/notes/');
      assert.ok(homeToNotes?.oldAvatar && homeToNotes?.newAvatar, 'Avatar snapshot source or target missing');
      assert.equal(homeToNotes.oldAvatar.name, 'site-avatar');
      assert.equal(homeToNotes.newAvatar.name, 'site-avatar');
      assert.ok(Math.abs(homeToNotes.oldAvatar.width - homeToNotes.newAvatar.width) > 20, 'Avatar size transition was lost');
      assert.deepEqual(errors, []);
      return { transitions: transitions.length, avatar: homeToNotes };
    } finally { await context.close(); }
  });

  await run('mobile 390: TOC tap, scroll unlock and bounded sheets', async () => {
    const { page, context, errors } = await createPage({ width: 390, height: 844 }, true);
    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
      await saveHomeScreenshots(page, true);
      await navigate(page, fixtures.toc, 'note');
      await page.screenshot({ path: path.join(outputDir, 'article-mobile.png') });
      const fab = page.locator('[data-mobile-toc-fab]');
      const sheet = page.locator('[data-mobile-toc-sheet]');
      await fab.tap();
      await page.waitForFunction(() => document.querySelector('[data-mobile-toc-sheet]').classList.contains('is-open'));
      assert.equal(await fab.getAttribute('aria-expanded'), 'true');
      const box = await page.locator('.mobile-toc-panel').boundingBox();
      assert.ok(box.height <= 844 * 0.85 + 2, `TOC sheet exceeds 85% of viewport: ${box.height}`);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.screenshot({ path: path.join(outputDir, 'toc-mobile-open.png') });
      const links = sheet.locator('nav a');
      const targetLink = links.nth(Math.floor(await links.count() / 2));
      const targetID = decodeURIComponent((await targetLink.getAttribute('href')).slice(1));
      const before = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().top + scrollY, targetID);
      assert.ok(before > 200, 'Fixture heading is not far enough down to test scrolling');
      await targetLink.tap();
      await page.waitForFunction(id => {
        const target = document.getElementById(id);
        const top = target.getBoundingClientRect().top;
        return decodeURIComponent(location.hash.slice(1)) === id && top >= 0 && top < innerHeight / 2 && scrollY > 100;
      }, targetID);
      assert.equal(await fab.getAttribute('aria-expanded'), 'false');
      assert.equal(await sheet.getAttribute('aria-hidden'), 'true');
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden', 'TOC tap left body locked');
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 300);
      await page.waitForFunction(previous => scrollY > previous + 50, scrollBefore);
      await navigate(page, '/notes/', 'notes');
      assert.equal(await page.locator('[data-mobile-toc-sheet]').count(), 0, 'SPA cleanup left old article sheet');
      await page.locator('#mobile-menu-toggle').tap();
      for (const selector of ['.mobile-drawer-nav .drawer-nav-link']) {
        const link = page.locator(selector).first();
        const originalColor = await link.evaluate(element => getComputedStyle(element).color);
        await link.hover();
        assert.equal(await link.evaluate(element => getComputedStyle(element).color), originalColor);
        assert.equal(await link.evaluate(element => getComputedStyle(element, '::before').content), 'none');
      }
      await page.locator('#drawer-tags-btn').tap();
      await page.waitForFunction(() => document.body.classList.contains('is-tags-overlay-open'));
      const tagsBox = await page.locator('#mobile-tags-overlay').boundingBox();
      assert.ok(tagsBox.height <= 844 * 0.85 + 2, `Tags sheet exceeds viewport cap: ${tagsBox.height}`);
      await page.locator('#mobile-tags-overlay [data-overlay-close]').tap();
      await page.waitForFunction(() => !document.body.classList.contains('is-mobile-scroll-locked'));
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.deepEqual(errors, []);
      return { tocSheetHeight: box.height, tagsSheetHeight: tagsBox.height, heading: targetID };
    } finally { await context.close(); }
  });

  await run('archive uptime advances after one day without rebuilding', async () => {
    const { page, context, errors } = await createPage({ width: 1440, height: 1000 });
    try {
      await page.goto(`${baseURL}/archive/`, { waitUntil: 'networkidle' });
      const counter = page.locator('.archive-stat-num[data-started-at]');
      const initial = Number(await counter.getAttribute('data-target'));
      assert.ok(initial > 3, `Archive uptime remained stale: ${initial}`);
      await page.waitForFunction(expected => Number(document.querySelector('.archive-stat-num[data-started-at]').textContent.replaceAll(',', '')) === expected, initial);
      await page.evaluate(() => window.__daybookAdvanceDay());
      await navigate(page, '/notes/', 'notes');
      await navigate(page, '/archive/', 'archive');
      await page.waitForFunction(expected => Number(document.querySelector('.archive-stat-num[data-started-at]').textContent.replaceAll(',', '')) === expected, initial + 1);
      assert.equal(Number(await counter.getAttribute('data-target')), initial + 1);
      assert.deepEqual(errors, []);
      return { initialDays: initial, followingDay: initial + 1 };
    } finally { await context.close(); }
  });
}

await browser.close();
await writeFile(path.join(outputDir, 'results.json'), JSON.stringify({ baseURL, results, failures }, null, 2) + '\n');
if (failures.length) process.exitCode = 1;
