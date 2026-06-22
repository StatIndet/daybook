const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1313/notes/whale-song/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  
  const isInitialized = await page.evaluate(() => {
    const netease = document.querySelector('.nm-player');
    const customPlayer = document.querySelector('.netease-custom-player');
    return {
      netease: !!netease,
      hasCustomPlayer: !!customPlayer,
      initializedAttr: customPlayer ? customPlayer.getAttribute('data-initialized') : null
    };
  });

  console.log('Result:', isInitialized);
  await browser.close();
})();
