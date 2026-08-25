const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (response.status() === 404) {
      console.log('404:', response.url());
    }
  });
  
  await page.goto('http://localhost:1313/notes/');
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
  process.exit(0);
})();
