import puppeteer from 'puppeteer';

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log("Testing Home & Settings...");
  await page.goto('http://localhost:1313/');
  await page.waitForSelector('.persistent-logo', { timeout: 5000 });
  await page.click('.persistent-logo');
  await page.waitForSelector('#settings-overlay[aria-hidden="false"]', { timeout: 5000 });
  await page.evaluate(() => document.querySelector('.settings-close-btn').click());
  await new Promise(r => setTimeout(r, 1000));

  console.log("Testing Graph direct load...");
  await page.goto('http://localhost:1313/graph/');
  await page.waitForSelector('svg', { timeout: 5000 });

  console.log("Testing Nested article SPA load...");
  await page.goto('http://localhost:1313/notes/');
  await page.waitForSelector('.notes-list', { timeout: 5000 });
  await page.evaluate(() => document.querySelector('a[href="/notes/examples/Markdown%e6%89%a9%e5%b1%95%e8%af%ad%e6%b3%95%e6%b5%8b%e8%af%95%e9%a1%b5/"]').click());
  await page.waitForFunction('decodeURIComponent(window.location.pathname) === "/notes/examples/Markdown扩展语法测试页/"', { timeout: 3000 });
  await page.waitForSelector('.markdown', { timeout: 5000 });
  
  await browser.close();
  console.log("All tests passed!");
})();
