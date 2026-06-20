const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('response', response => {
    if (!response.ok()) {
      console.log('RESPONSE FAILED:', response.status(), response.url());
    }
  });
  
  await page.goto('http://localhost:1313/notes/', { waitUntil: 'networkidle0' });
  
  const h1 = await page.$$eval('h1', nodes => nodes.map(n => n.textContent));
  console.log('H1 found:', h1);
  
  await browser.close();
})();
