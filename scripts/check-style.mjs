import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:1313/notes/typography-test/');
  
  const computedStyles = await page.evaluate(() => {
    const inlineCode = document.querySelector('blockquote p code');
    const blockCode = document.querySelector('blockquote pre code');
    
    return {
      inlineCode: inlineCode ? {
        fontStyle: window.getComputedStyle(inlineCode).fontStyle,
        fontFamily: window.getComputedStyle(inlineCode).fontFamily,
      } : null,
      blockCode: blockCode ? {
        fontStyle: window.getComputedStyle(blockCode).fontStyle,
        fontFamily: window.getComputedStyle(blockCode).fontFamily,
      } : null
    };
  });
  
  console.log(JSON.stringify(computedStyles, null, 2));
  await browser.close();
})();
