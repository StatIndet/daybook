const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  
  let classList = await page.evaluate(() => document.querySelector('[data-notes-tools]').className);
  console.log('Before click:', classList);
  
  await page.click('[data-notes-tool="search"]');
  
  classList = await page.evaluate(() => document.querySelector('[data-notes-tools]').className);
  console.log('After click:', classList);
  
  await browser.close();
  process.exit(0);
})();
