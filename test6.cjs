(async () => {
  const browser = await require('puppeteer').launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://localhost:1313/graph/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'graph_screenshot.png' });
  await browser.close();
})();
