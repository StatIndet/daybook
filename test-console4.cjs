const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  
  await page.click('#mobile-menu-toggle');
  await page.waitForTimeout(500);
  await page.click('[data-mobile-overlay-target="search"]');
  await page.waitForTimeout(500);
  
  // type in mobile search
  console.log("Typing mobile search...");
  await page.type('#mobile-search-input', 'Markdown');
  
  await page.waitForTimeout(500);
  
  const html = await page.evaluate(() => document.getElementById("mobile-search-results").innerHTML);
  console.log('Mobile results HTML:', html);
  
  const display = await page.evaluate(() => window.getComputedStyle(document.getElementById("mobile-search-results")).display);
  console.log('Mobile results display:', display);
  
  await browser.close();
  process.exit(0);
})();
