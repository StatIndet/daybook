const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.failure().errorText, request.url()));
  
  await page.goto('http://localhost:1313/notes/', { waitUntil: 'networkidle0' });
  
  const nodes = await page.$$eval('.graph-node', nodes => nodes.length);
  console.log('Graph Nodes found:', nodes);
  
  await browser.close();
})();
