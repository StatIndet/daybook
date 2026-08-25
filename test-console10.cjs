const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  
  await page.click('[data-notes-tool="search"]');
  
  const box = await page.evaluate(() => {
    const el = document.querySelector('.notes-search-panel');
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return { 
      rect, 
      display: style.display, 
      visibility: style.visibility,
      opacity: style.opacity,
      maxHeight: style.maxHeight,
      transform: style.transform
    };
  });
  console.log(box);
  
  await browser.close();
  process.exit(0);
})();
