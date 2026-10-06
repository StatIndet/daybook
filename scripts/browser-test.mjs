import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const serverUrl = process.env.DAYBOOK_TEST_URL || 'http://localhost:1313';

// A swapped DOM can appear before its View Transition finishes. Wait before
// starting the next navigation so this smoke test does not cancel animations.
async function settled(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-transitioning'));
}

async function run() {
  console.log('Starting Playwright smoke test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 }
  });
  
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  
  page.on('pageerror', err => {
    errors.push(`PageError: ${err.message}`);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon')) {
        errors.push(`ConsoleError: ${text}`);
      }
    }
  });

  await page.addInitScript(() => {
    window.__daybookViewTransitionCount = 0;
    if (document.startViewTransition) {
      const original = document.startViewTransition;
      document.startViewTransition = function(cb) {
        window.__daybookViewTransitionCount++;
        return original.call(this, cb);
      };
    }
  });

  try {
    console.log('Checking homepage lazy resources...');
    await page.goto(`${serverUrl}/`, { waitUntil: 'networkidle' });
    const homeRequests = [...requests];
    if (homeRequests.some(url => /settings-paper|maple-mono|\/(?:toc|mobile-toc|embeds|katex-loader|mermaid-loader|lightbox|code-copy)\.[a-f0-9]+\.js/.test(url))) {
      throw new Error('Homepage eagerly loaded paper, code fonts, or article scripts.');
    }
    if (await page.locator('link[rel="stylesheet"][href*="/css/bundles/home."]').count() !== 1) {
      throw new Error('Homepage CSS bundle is missing.');
    }

    console.log('Opening settings lazily...');
    await page.locator('.persistent-logo').click();
    await page.waitForSelector('#settings-overlay.is-open');
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('settings-paper')));
    assert.equal(await page.locator('.settings-checkbox-input:checked').count(), 0, 'All preferences start unchecked');
    assert.equal(await page.locator('html.has-custom-cursor').count(), 1, 'Custom cursor is the default');
    assert.equal(await page.locator('#setting-clock-cursor').isDisabled(), false);
    await page.locator('#setting-system-cursor').check();
    assert.equal(await page.locator('.daybook-cursor').count(), 0, 'Selecting system cursor removes the custom cursor');
    assert.equal(await page.locator('#setting-clock-cursor').isDisabled(), true);
    assert.equal(await page.locator('#setting-clock-cursor').isChecked(), false);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html.has-custom-cursor').count(), 0, 'System cursor choice survives reload');
    await page.locator('.persistent-logo').click();
    await page.waitForSelector('#settings-overlay.is-open');
    assert.equal(await page.locator('#setting-system-cursor').isChecked(), true);
    await page.locator('#setting-system-cursor').uncheck();
    assert.equal(await page.locator('html.has-custom-cursor').count(), 1, 'Unchecking restores the custom cursor');
    assert.equal(await page.locator('#setting-clock-cursor').isDisabled(), false);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#settings-overlay.is-open', { state: 'hidden' });

    console.log('Navigating home → notes...');
    await page.evaluate(() => {
      // Capture the actual entry animation, including every rendered nav item.
      const observer = new MutationObserver(() => {
        if (!document.body.classList.contains('page-entering')) return;
        const links = [...document.querySelectorAll('.side-nav:not(.transition-stable) .nav-link')];
        if (!links.length) return;
        window.__sideNavEntry = links.map(link => {
          const style = getComputedStyle(link);
          return { label: link.textContent.trim(), name: style.animationName, delay: parseFloat(style.animationDelay) };
        });
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
      window.__sideNavEntryObserver = observer;
    });
    await page.locator('.site-nav a[href="/notes/"]').click();
    await page.waitForSelector('.notes-list', { state: 'attached', timeout: 5000 });
    if (await page.locator('link[rel="stylesheet"][href*="/css/bundles/pages."]').count() !== 1) {
      throw new Error('SPA navigation did not install the pages CSS bundle.');
    }
    
    if (errors.length > 0) throw new Error(errors.join('\n'));

    await settled(page);
    const navEntry = await page.evaluate(() => {
      window.__sideNavEntryObserver.disconnect();
      return window.__sideNavEntry;
    });
    if (!navEntry?.length || navEntry.some((item, index) =>
      item.name !== 'side-nav-enter' || (index > 0 && item.delay <= navEntry[index - 1].delay))) {
      throw new Error(`Side navigation must enter in top-to-bottom order: ${JSON.stringify(navEntry)}`);
    }
    console.log('Navigating to article...');
    const articleLink = page.locator('h1.notes-item-title a').first();
    await articleLink.click();
    
    await page.waitForSelector('div.post-content', { state: 'attached', timeout: 5000 });
    
    const vtCount = await page.evaluate(() => window.__daybookViewTransitionCount);
    if (vtCount === 0) {
      throw new Error('View Transition API was not called during SPA navigation.');
    }
    
    console.log('Checking KaTeX render...');
    await page.waitForSelector('.katex', { state: 'attached', timeout: 5000 });
    const katexCount = await page.locator('.katex').count();
    if (katexCount === 0) {
      throw new Error('KaTeX DOM (.katex) was not generated.');
    }
    if (requests.some(url => new URL(url).pathname === '/vendor/katex/katex.min.css')) {
      throw new Error('KaTeX duplicated the existing hashed stylesheet.');
    }

    console.log('Checking share panel...');
    await page.locator('[data-share-open]').first().click();
    await page.waitForSelector('#share-overlay.is-open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#share-overlay.is-open', { state: 'hidden' });
    
    console.log('Testing custom cursor regression...');
    await page.evaluate(() => {
      const enterEvent = new MouseEvent('mouseenter', { bubbles: true });
      document.dispatchEvent(enterEvent);
      
      const leaveEvent = new MouseEvent('mouseleave', { bubbles: true });
      document.dispatchEvent(leaveEvent);
    });
    
    if (errors.length > 0) throw new Error(errors.join('\n'));
    
    console.log('Testing browser back...');
    await page.goBack();
    await page.waitForSelector('.notes-list', { state: 'attached', timeout: 5000 });
    
    if (errors.length > 0) throw new Error(errors.join('\n'));

    await settled(page);
    console.log('Testing browser forward...');
    await page.goForward();
    await page.waitForSelector('div.post-content', { state: 'attached', timeout: 5000 });
    await page.waitForSelector('.katex', { state: 'attached', timeout: 5000 });

    await settled(page);
    console.log('Testing graph navigation...');
    await page.locator('.side-nav a[href="/graph/"]').click();
    await page.waitForSelector('#graph-container svg', { state: 'attached', timeout: 10000 });

    await settled(page);
    console.log('Testing homepage return...');
    await page.evaluate(() => window.daybookNavigateTo('/'));
    await page.waitForSelector('[data-github-home]', { state: 'attached', timeout: 5000 });
    if (errors.length > 0) throw new Error(errors.join('\n'));
    
    console.log('Checking reduced-motion About decoration across navigation and reload...');
    await settled(page);
    await page.evaluate(() => window.daybookNavigateTo('/about/'));
    await page.waitForSelector('.golden-spiral');
    await settled(page);
    await page.locator('.persistent-logo').click();
    await page.locator('#setting-reduced-motion').check();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.golden-spiral').isVisible(), false);
    assert.equal(await page.locator('.golden-spiral').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    await page.evaluate(() => window.daybookNavigateTo('/notes/'));
    await page.waitForSelector('.notes-list');
    await settled(page);
    await page.evaluate(() => window.daybookNavigateTo('/about/'));
    await page.waitForSelector('.golden-spiral', { state: 'attached' });
    await settled(page);
    assert.equal(await page.locator('.golden-spiral').isVisible(), false);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.golden-spiral').isVisible(), false, 'Reduced motion persists through reload');
    assert.equal(await page.locator('html.has-custom-cursor').count(), 0);
    await page.locator('.persistent-logo').click();
    assert.equal(await page.locator('#setting-reduced-motion').isChecked(), true);
    await page.locator('#setting-reduced-motion').uncheck();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.golden-spiral').isVisible(), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.golden-spiral').isVisible(), false, 'System reduced motion also hides the decoration');
    if (errors.length > 0) throw new Error(errors.join('\n'));

    console.log('Browser tests passed successfully.');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
