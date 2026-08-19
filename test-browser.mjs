import puppeteer from 'puppeteer';

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // 3. Graph Direct Load check
  console.log("Testing Graph direct load...");
  await page.goto('http://localhost:1313/graph/');
  await page.waitForSelector('svg', { timeout: 5000 });
  console.log("Graph rendered direct load.");

  // 4. Graph SPA Load check
  console.log("Testing Graph SPA load...");
  await page.goto('http://localhost:1313/notes/');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    document.querySelector('a[href="/graph/"]').click();
  });
  await page.waitForFunction('window.location.pathname === "/graph/"', { timeout: 3000 });
  await page.waitForSelector('svg', { timeout: 5000 });
  console.log("Graph rendered SPA load.");

  await browser.close();
  console.log("All tests passed!");
})();
