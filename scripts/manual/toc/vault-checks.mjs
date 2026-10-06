import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkStickyRail(page) {
  await page.waitForFunction(() => document.querySelector('.note-toc-stage').classList.contains('is-reading'));
  const sticky = await page.locator('.note-toc-wrapper').boundingBox();
  assert.ok(Math.abs(sticky.y - 88) <= 1, `TOC must remain in view while reading: ${JSON.stringify(sticky)}`);
  const overlap = await page.evaluate(() => {
    const content = document.querySelector('.post-content').getBoundingClientRect();
    const rail = document.querySelector('.reading-toc-rail').getBoundingClientRect();
    return rail.left < content.right;
  });
  assert.equal(overlap, false, 'Reading rail overlaps article content');
}

export async function runVaultTocChecks({ run, createPage, baseURL, fixtures, settled, navigate, outputDir, saveHomeScreenshots }) {
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

  await run('mobile 390: TOC tap, scroll unlock and cleanup', async () => {
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
      assert.deepEqual(errors, []);
      return { tocSheetHeight: box.height, heading: targetID };
    } finally { await context.close(); }
  });

}
