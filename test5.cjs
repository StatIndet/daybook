(async () => {
  const browser = await require('puppeteer').launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  const nodes = await page.$$eval('.graph-node', nodes => nodes.map(n => n.parentNode.getAttribute('transform')));
  console.log('Nodes transform:', nodes);
  await browser.close();
})();
