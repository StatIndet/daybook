import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const image = index => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="hsl(${index * 55} 35% 45%)"/><circle cx="450" cy="300" r="130" fill="white"/><text x="450" y="330" text-anchor="middle" font-size="100">${index + 1}</text></svg>`);
const gallery = (count = 5, id = 'gallery') => `<div id="${id}" class="md-gallery">${Array.from({ length: count }, (_, index) => `<figure><img src="${image(index)}" alt="Image ${index + 1}"><figcaption>Image ${index + 1}</figcaption></figure>`).join('')}</div>`;

async function install() {
  await page.setContent(`<!doctype html><html lang="en-US"><body style="margin:0;min-height:2000px"><main class="markdown post-content" style="width:min(704px,calc(100% - 32px));margin:40px auto">${gallery()}<figure id="ordinary"><img src="${image(5)}" style="width:300px" alt="Ordinary"></figure></main></body></html>`);
  for (const file of ['tokens.css', 'components.css', 'markdown.css']) {
    await page.addStyleTag({ path: path.join(root, 'internal/embedded/static/css', file) });
  }
  for (const file of ['lightbox.js', 'gallery.js']) {
    await page.addScriptTag({ path: path.join(root, 'internal/embedded/static/js', file) });
  }
  await page.waitForSelector('.is-carousel');
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
}

async function geometry() {
  return page.locator('#gallery').evaluate(element => {
    const viewport = element.getBoundingClientRect();
    return {
      width: element.clientWidth, scroll: element.scrollLeft, max: element.scrollWidth - element.clientWidth,
      stage: element.querySelector('.md-carousel-stage').getBoundingClientRect().x - viewport.x,
      items: [...element.querySelectorAll('.md-carousel-item')].map(item => {
        const rect = item.getBoundingClientRect();
        return { x: rect.x - viewport.x, right: rect.right - viewport.x, width: rect.width, imageWidth: item.querySelector('img').width };
      }),
    };
  });
}
async function setProgress(progress) {
  await page.locator('#gallery').evaluate((element, progress) => {
    element.scrollLeft = (element.scrollWidth - element.clientWidth) * progress;
    element.dispatchEvent(new Event('scroll'));
  }, progress);
}
async function key(key) {
  await page.locator('#gallery').focus();
  await page.keyboard.press(key);
  await page.waitForTimeout(800);
}

try {
  await install();
  const initial = await geometry();
  assert(initial.items[0].width > initial.items[1].width && initial.items[1].width > initial.items[2].width, 'Start has large, medium and small image masks');
  const fullWidth = initial.items[0].imageWidth;
  assert.equal(initial.items[0].imageWidth, initial.items[2].imageWidth, 'Masks crop an identical full-size image surface');
  for (let step = 0; step <= 32; step++) {
    await setProgress(step / 32);
    const current = await geometry();
    assert(Math.abs(current.stage) < 1, 'Native scrolling keeps the visual stage in place');
    const visible = current.items.filter(item => item.right > 1 && item.x < current.width - 1);
    assert(visible.length >= 2, 'The viewport always offers more than one image');
    for (let i = 1; i < visible.length; i++) {
      assert(Math.abs(visible[i].x - visible[i - 1].right - 12) < 1.5, 'Masks keep even gaps while interpolating');
    }
    assert(current.items.every(item => item.imageWidth === fullWidth), 'Scroll masks do not squeeze or rescale images');
    if (step === 32) {
      assert(Math.abs(current.items.at(-1).width - initial.items[0].width) < 1, 'The final image expands fully');
      assert(Math.abs(current.items.at(-1).right - current.width) < 1, 'End layout fills the viewport');
    }
  }

  await key('Home');
  const samples = await page.locator('#gallery').evaluate(async element => {
    const positions = [element.scrollLeft];
    const wheel = new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true });
    element.dispatchEvent(wheel);
    positions.push(element.scrollLeft);
    for (let i = 0; i < 8; i++) {
      await new Promise(requestAnimationFrame);
      positions.push(element.scrollLeft);
    }
    return { positions, consumed: wheel.defaultPrevented };
  });
  assert(samples.consumed, 'A vertical wheel moves the gallery');
  assert.equal(samples.positions[0], samples.positions[1], 'Wheel input must not jump synchronously');
  assert(samples.positions.filter((value, index, values) => index && value > values[index - 1]).length > 3, 'Wheel movement spans multiple frames');
  await page.waitForTimeout(900);
  const snapped = await geometry();
  assert(Math.abs(snapped.scroll - snapped.max / 4) < 1.5, 'Idle motion settles at an image keyline');

  await key('End');
  const released = await page.locator('#gallery').evaluate(element => {
    const events = [new WheelEvent('wheel', { deltaY: 100, cancelable: true }), new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true })];
    events.forEach(event => element.dispatchEvent(event));
    return events.map(event => event.defaultPrevented);
  });
  assert.deepEqual(released, [false, false], 'End-of-gallery scrolling and pinch zoom stay native');

  await key('Home');
  const box = await page.locator('#gallery').boundingBox();
  await page.mouse.move(box.x + 180, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 80, { steps: 8 });
  await page.mouse.up();
  assert((await geometry()).scroll > 100, 'Mouse dragging scrolls the gallery');
  assert.equal(await page.locator('.zoom-img').count(), 0, 'Finishing a drag must not open the lightbox');
  await page.waitForTimeout(800);
  await key('Home');

  await page.mouse.move(box.x + box.width - 1, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 30, box.y + 80);
  await page.mouse.up();
  await page.mouse.move(box.x + 200, box.y + 80);
  assert.equal(await page.locator('.is-dragging').count(), 0, 'Releasing outside the gallery cannot leave a pending drag');

  // The masked medium image expands to its natural aspect ratio in the lightbox.
  const medium = await page.locator('#gallery .md-carousel-item').nth(1).boundingBox();
  await page.mouse.click(medium.x + medium.width / 2, medium.y + 60);
  await page.waitForSelector('.zoom-img');
  await page.waitForTimeout(400);
  const zoom = await page.locator('.zoom-img').boundingBox();
  assert(Math.abs(zoom.width / zoom.height - 1.5) < 0.01, 'Gallery zoom restores the full, undistorted image');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.zoom-img', { state: 'detached' });
  await key('Home');
  await page.locator('#gallery img').nth(1).evaluate(async image => {
    image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="teal"/></svg>');
    await image.decode();
  });
  const portraitMask = await page.locator('#gallery .md-carousel-item').nth(1).boundingBox();
  await page.mouse.click(portraitMask.x + portraitMask.width / 2, portraitMask.y + 60);
  await page.waitForSelector('.zoom-img');
  assert(await page.locator('.zoom-img').evaluate(image => parseFloat(image.style.width) > 300 && /inset\(0px? [1-9]/.test(image.style.clipPath)), 'Portrait zoom starts with the same full image surface and narrow mask');
  await page.waitForTimeout(400);
  const portraitZoom = await page.locator('.zoom-img').boundingBox();
  assert(Math.abs(portraitZoom.width / portraitZoom.height - 0.5) < 0.01, 'Portrait photos also zoom to their natural aspect ratio');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.zoom-img', { state: 'detached' });
  await page.locator('#gallery img').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert.equal(await page.locator('.zoom-status').textContent(), '1 / 6');
  assert(await page.locator('main').evaluate(node => node.inert), 'The image viewer makes the article inert');
  await page.locator('.zoom-next').click();
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert.equal(await page.locator('.zoom-status').textContent(), '2 / 6');
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert.equal(await page.locator('.zoom-status').textContent(), '3 / 6');
  await page.locator('.zoom-previous').click();
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert.equal(await page.locator('.zoom-status').textContent(), '2 / 6');
  await page.keyboard.press('End');
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert(await page.locator('.zoom-next').isDisabled(), 'The final photo disables next');
  await page.keyboard.press('Home');
  await page.waitForSelector('.zoom-overlay[aria-busy="false"]');
  assert(await page.locator('.zoom-previous').isDisabled(), 'The first photo disables previous');
  await page.locator('.zoom-img').dblclick();
  assert.equal(await page.locator('.zoom-toggle').getAttribute('aria-pressed'), 'true');
  const zoomed = await page.locator('.zoom-img').boundingBox();
  await page.mouse.move(600, 450);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(width => document.querySelector('.zoom-img').getBoundingClientRect().width > width, zoomed.width);
  await page.mouse.down(); await page.mouse.move(680, 490, { steps: 4 }); await page.mouse.up();
  assert(await page.locator('.zoom-img').evaluate(img => !img.style.transform.startsWith('translate3d(0px, 0px,')), 'A zoomed image can be dragged');
  await page.keyboard.press('0');
  assert.equal(await page.locator('.zoom-toggle').getAttribute('aria-pressed'), 'false');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert(await page.locator('.zoom-overlay').evaluate(node => node.contains(document.activeElement)), 'Tab stays in the image viewer');
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('.zoom-img', { state: 'detached' });
  assert.equal(await page.locator('main').evaluate(node => node.inert), false, 'Closing restores article interactions');
  assert(await page.locator('#gallery img').first().evaluate(node => node === document.activeElement), 'Closing restores the original focus');
  await page.locator('#ordinary img').click();
  await page.waitForSelector('.zoom-img');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.zoom-img', { state: 'detached' });

  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) document.dispatchEvent(new Event('daybook:page-load'));
    document.documentElement.lang = 'zh-CN';
    document.dispatchEvent(new Event('daybook:lang-change'));
  });
  assert.equal(await page.locator('#gallery .md-carousel-track').count(), 1, 'Repeated page events do not duplicate the carousel');
  assert.equal(await page.locator('#gallery').getAttribute('aria-label'), '图片画廊');
  await key('End');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const narrow = await geometry();
  assert(Math.abs(narrow.scroll - narrow.max) < 2, 'Resizing preserves the selected image');
  assert(narrow.width < 390 && Math.abs(narrow.items.at(-1).right - narrow.width) < 1.5, 'Narrow layout stays contained');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#gallery').focus();
  await page.keyboard.press('Home');
  assert.equal((await geometry()).scroll, 0, 'Reduced motion makes navigation immediate');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'true');
  await page.keyboard.press('End');
  assert(Math.abs((await geometry()).scroll - (await geometry()).max) < 1, 'The blog motion preference is honored too');

  // Simulate a real content swap while animation is active, including short galleries.
  await page.evaluate(markup => {
    delete document.documentElement.dataset.reducedMotion;
    document.querySelector('#gallery').dispatchEvent(new WheelEvent('wheel', { deltaY: -500, cancelable: true }));
    window.__oldGallery = document.querySelector('#gallery');
    document.dispatchEvent(new Event('daybook:before-swap'));
    document.querySelector('main').innerHTML = markup;
    document.dispatchEvent(new Event('daybook:page-load'));
  }, gallery(5) + gallery(1, 'single') + gallery(2, 'pair') + '<div id="mixed" class="md-gallery"><p>Text stays readable</p><figure><img src="' + image(0) + '"></figure></div>');
  const oldScroll = await page.evaluate(() => window.__oldGallery.scrollLeft);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__oldGallery.scrollLeft), oldScroll, 'Detached carousels stop their animation');
  assert.equal(await page.locator('.md-carousel-track').count(), 3, 'All new galleries initialize once');
  assert.equal(await page.locator('#mixed.is-carousel').count(), 0, 'Mixed content keeps a readable native fallback');
  const short = await page.evaluate(() => ['single', 'pair'].map(id => {
    const element = document.getElementById(id);
    const cards = [...element.querySelectorAll('.md-carousel-item')];
    return { width: element.clientWidth, max: element.scrollWidth - element.clientWidth, widths: cards.map(card => card.getBoundingClientRect().width) };
  }));
  assert.equal(short[0].max, 0, 'A single image needs no scrolling');
  assert(Math.abs(short[0].widths[0] - short[0].width) < 1, 'A single image fills its available space');
  assert(Math.abs(short[1].widths.reduce((a, b) => a + b, 8) - short[1].width) < 1, 'Two-image galleries have no empty space');
  assert.deepEqual(errors, []);
  console.log('Gallery carousel browser tests passed: masks, continuity, wheel, drag, keyboard, zoom, resize, motion preferences and SPA cleanup.');

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touch = await touchContext.newPage();
  await touch.setContent(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;min-height:2000px"><main class="markdown post-content" style="margin:40px 16px">${gallery()}</main></body></html>`);
  for (const file of ['tokens.css', 'markdown.css']) await touch.addStyleTag({ path: path.join(root, 'internal/embedded/static/css', file) });
  await touch.addScriptTag({ path: path.join(root, 'internal/embedded/static/js/gallery.js') });
  const session = await touchContext.newCDPSession(touch);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 130 }] });
  for (let x = 280; x >= 100; x -= 20) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 130 }] });
    await touch.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(900);
  assert(await touch.locator('#gallery').evaluate(element => element.scrollLeft > 100), 'Touch swipes retain native scrolling and momentum');
  assert.equal(await touch.evaluate(() => window.scrollY), 0, 'Horizontal swipes do not move the article');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 210 }] });
  for (let y = 190; y >= 70; y -= 20) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
    await touch.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(300);
  assert(await touch.evaluate(() => window.scrollY > 50), 'Vertical swipes over the gallery can still scroll the article');
  console.log('Gallery touch swipe passed.');
  const viewer = await touchContext.newPage();
  await viewer.setContent(`<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="post-content"><img src="${image(0)}" width="300"><img src="${image(1)}" width="300"></main></html>`);
  for (const file of ['tokens.css', 'components.css']) await viewer.addStyleTag({ path: path.join(root, 'internal/embedded/static/css', file) });
  await viewer.addScriptTag({ path: path.join(root, 'internal/embedded/static/js/lightbox.js') });
  await viewer.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await viewer.locator('main img').first().tap();
  await viewer.waitForSelector('.zoom-overlay[aria-busy="false"]');
  const viewerSession = await touchContext.newCDPSession(viewer);
  const photo = await viewer.locator('.zoom-img').boundingBox();
  const swipeY = photo.y + photo.height / 2;
  await viewerSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 290, y: swipeY }] });
  for (let x = 270; x >= 90; x -= 30) await viewerSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: swipeY }] });
  await viewerSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await viewer.waitForFunction(() => document.querySelector('.zoom-status').textContent === '2 / 2');
  await viewer.waitForSelector('.zoom-overlay[aria-busy="false"]');
  await viewer.evaluate(() => document.dispatchEvent(new Event('daybook:before-swap')));
  assert.equal(await viewer.locator('.zoom-img').count(), 0, 'SPA navigation removes the viewer');
  assert.equal(await viewer.locator('main').evaluate(node => node.inert), false);
  assert.equal(await viewer.evaluate(() => document.body.style.overflow), '');
  await viewer.locator('main img').first().tap();
  await viewer.waitForSelector('.zoom-overlay[aria-busy="false"]');
  await viewer.locator('.zoom-close').tap();
  await viewer.waitForSelector('.zoom-img', { state: 'detached' });
  console.log('Lightbox touch swipe, close button and SPA cleanup passed.');
  await touchContext.close();
} finally {
  await browser.close();
}
