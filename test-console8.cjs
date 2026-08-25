const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  
  const val = await page.evaluate(() => {
    const btn = document.querySelector('[data-notes-tool="search"]');
    return btn ? btn.dataset.notesTool : "not found";
  });
  console.log('Dataset notesTool:', val);
  
  await browser.close();
  process.exit(0);
})();
