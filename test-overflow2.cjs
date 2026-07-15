const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });
    await page.goto('http://localhost:1313/notes/markdown-syntax/', { waitUntil: 'networkidle2' });
    
    const overflowElements = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('*'))
        .filter(el => {
            if (el.closest('.mobile-drawer-wrapper')) return false; // Ignore drawer
            if (el.closest('.mobile-toc-panel')) return false; // Ignore TOC panel
            const rect = el.getBoundingClientRect();
            return rect.right > w + 1 && rect.width > 0;
        })
        .map(el => ({
            tag: el.tagName,
            className: el.className,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
            text: el.textContent.substring(0, 30).trim()
        }));
    });
    
    console.log("OVERFLOW_ELEMENTS:", JSON.stringify(overflowElements, null, 2));
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})();
