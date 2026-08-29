import { chromium } from 'playwright';

const serverPort = 1313;
const serverUrl = `http://localhost:${serverPort}`;

async function run() {
  console.log('Starting Playwright smoke test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 }
  });
  
  const page = await context.newPage();
  const errors = [];
  
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
    const clockIsVisible = () => page.evaluate(() =>
      document.querySelector('.daybook-cursor-clock')?.classList.contains('is-visible') ?? false
    );

    console.log('Testing homepage single-click clock effect...');
    await page.goto(`${serverUrl}/`, { waitUntil: 'networkidle' });
    await page.mouse.move(2400, 1200);
    await page.mouse.click(2400, 1200);
    await page.waitForTimeout(100);
    if (!(await clockIsVisible())) {
      throw new Error('Homepage single click did not activate the clock cursor effect.');
    }

    console.log('Visiting /notes...');
    await page.goto(`${serverUrl}/notes/`, { waitUntil: 'networkidle' });
    
    if (errors.length > 0) throw new Error(errors.join('\n'));

    console.log('Navigating to article...');
    const articleLink = page.locator('h1.notes-item-title a').first();
    await articleLink.click();
    
    await page.waitForSelector('div.post-content', { state: 'attached', timeout: 5000 });

    if (await clockIsVisible()) {
      throw new Error('Clock effect was activated by the notes-list link click and carried into the article page.');
    }

    const vtCount = await page.evaluate(() => window.__daybookViewTransitionCount);
    if (vtCount === 0) {
      throw new Error('View Transition API was not called during SPA navigation.');
    }

    console.log('Testing article double-click clock effect...');
    await page.mouse.move(2400, 1200);
    await page.mouse.click(2400, 1200);
    await page.waitForTimeout(100);
    if (await clockIsVisible()) {
      throw new Error('Article single click activated the clock cursor effect.');
    }
    await page.mouse.dblclick(2400, 1200);
    await page.waitForTimeout(100);
    if (!(await clockIsVisible())) {
      throw new Error('Article double click did not activate the clock cursor effect.');
    }
    
    console.log('Checking KaTeX render...');
    await page.waitForSelector('.katex', { state: 'attached', timeout: 5000 });
    const katexCount = await page.locator('.katex').count();
    if (katexCount === 0) {
      throw new Error('KaTeX DOM (.katex) was not generated.');
    }
    
    console.log('Checking TOC right rail...');
    // 目录已移入右侧 sticky 阅读栏（note-page-aside），旧的超宽屏 SVG 弹簧轨道不再启用；
    // 这里断言新契约：右栏目录可见、滚动后保持 sticky、阅读进度随滚动更新。
    await page.waitForSelector('.note-page-aside [data-note-toc]', { state: 'visible', timeout: 5000 });

    const railProbe = () => page.evaluate(() => {
      const wrapper = document.querySelector('.note-page-aside .note-toc-wrapper');
      const rect = wrapper?.getBoundingClientRect();
      return {
        top: rect?.top ?? null,
        visible: !!rect && rect.bottom > 0 && rect.top < window.innerHeight,
        progress: document.querySelector('[data-desktop-progress-text]')?.textContent ?? null,
      };
    });

    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
    const firstScroll = await railProbe();
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
    const secondScroll = await railProbe();

    if (!secondScroll.visible) {
      throw new Error('TOC right rail is not visible after scrolling.');
    }
    if (firstScroll.top === null || secondScroll.top === null
        || Math.abs(secondScroll.top - firstScroll.top) > 2) {
      throw new Error('TOC right rail did not stay sticky between scrolled positions.');
    }
    if (!secondScroll.progress || secondScroll.progress === '0%'
        || secondScroll.progress === firstScroll.progress) {
      throw new Error('Reading progress did not update while scrolling the article.');
    }
    
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
    
    console.log('Browser tests passed successfully.');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
