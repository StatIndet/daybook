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
  
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  
  const nodes = await page.$$eval('.graph-node', nodes => nodes.length);
  console.log('Graph Nodes found:', nodes);
  
  await browser.close();
})();
(async () => {
  const browser = await require('puppeteer').launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  const h = await page.$$eval('#graph-container', nodes => nodes[0].clientHeight);
  console.log('Container height:', h);
  const w = await page.$$eval('#graph-container', nodes => nodes[0].clientWidth);
  console.log('Container width:', w);
  await browser.close();
})();
