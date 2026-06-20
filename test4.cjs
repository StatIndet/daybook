(async () => {
  const browser = await require('puppeteer').launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  const attr = await page.$$eval('#graph-container g', nodes => nodes[0].getAttribute('transform'));
  console.log('Transform:', attr);
  await browser.close();
})();
