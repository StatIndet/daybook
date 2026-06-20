const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  await page.goto('http://localhost:1313/notes/hello-daybook/', { waitUntil: 'networkidle0' });
  const hasWaline = await page.evaluate(() => document.getElementById('waline') !== null);
  const walineHtml = await page.evaluate(() => document.getElementById('waline')?.innerHTML);
  console.log('Has Waline container:', hasWaline);
  console.log('Waline HTML:', walineHtml ? walineHtml.substring(0, 100) : 'none');
  await browser.close();
})();
