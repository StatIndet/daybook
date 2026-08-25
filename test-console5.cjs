const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  await page.goto('http://localhost:1313/notes/');
  
  await page.click('#mobile-menu-toggle');
  await page.waitForTimeout(500);
  await page.click('[data-mobile-overlay-target="search"]');
  await page.waitForTimeout(500);
  
  console.log("Typing mobile search...");
  await page.type('#mobile-search-input', 'Markdown');
  
  await page.waitForTimeout(500);
  
  const html = await page.evaluate(() => document.getElementById("mobile-search-results").innerHTML);
  console.log('Mobile results HTML length:', html.length);
  
  await browser.close();
  process.exit(0);
})();
