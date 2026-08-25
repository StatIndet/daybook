const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  
  await page.click('[data-notes-tool="search"]');
  
  // take screenshot of the aside
  const aside = await page.$('.notes-aside');
  await aside.screenshot({ path: 'aside.png' });
  
  await browser.close();
  process.exit(0);
})();
