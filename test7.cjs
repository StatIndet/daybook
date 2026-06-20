(async () => {
  const browser = await require('puppeteer').launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  const r = await page.$$eval('.graph-node', nodes => nodes.map(n => n.getAttribute('r')));
  console.log('Radii:', r);
  const stroke = await page.$$eval('.graph-node', nodes => nodes.map(n => window.getComputedStyle(n).stroke));
  console.log('Stroke:', stroke);
  await browser.close();
})();
