const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/');
  await page.click('[data-notes-tool="search"]');
  
  const classes = await page.evaluate(() => {
    const tools = document.querySelector('.notes-tools');
    return tools.className;
  });
  console.log('notes-tools class:', classes);
  
  await browser.close();
  process.exit(0);
})();
