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
    console.log('Visiting /notes...');
    await page.goto(`${serverUrl}/notes/`, { waitUntil: 'networkidle' });
    
    if (errors.length > 0) throw new Error(errors.join('\n'));

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
    
    console.log('Checking TOC Rail...');
    await page.waitForSelector('[data-reading-toc-rail-base]', { state: 'attached', timeout: 5000 });
    
    const initialPath = await page.getAttribute('[data-reading-toc-rail-base]', 'd');
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500); 
    
    const scrolledPath = await page.getAttribute('[data-reading-toc-rail-base]', 'd');
    if (initialPath === scrolledPath) {
      throw new Error('TOC SVG path did not animate after scrolling (spring physics inactive).');
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
