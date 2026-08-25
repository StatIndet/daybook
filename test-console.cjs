const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  
  await page.goto('http://localhost:1313/notes/');
  
  // click search button
  console.log("Clicking search...");
  await page.click('[data-notes-tool="search"]');
  
  // click tags button
  console.log("Clicking tags...");
  await page.click('[data-notes-tool="tags"]');
  
  // type in mobile search
  console.log("Typing mobile search...");
  await page.click('#mobile-menu-toggle');
  await page.click('[data-mobile-overlay-target="search"]');
  await page.type('#mobile-search-input', 'test');
  
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
  process.exit(0);
})();
