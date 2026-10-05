import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise the presentation clocks independently of network and page-transition
// timing, including requests that finish just after the indicator appears.
const { outputFiles } = await build({
  stdin: {
    contents: `
      import { NavigationLoading } from './assets/ts/navigation-loading';
      import { LiquidCursor } from './assets/ts/liquid-cursor';
      const loading = new NavigationLoading();
      const liquid = new LiquidCursor();
      const cursor = document.querySelector('.daybook-cursor');
      cursor.append(liquid.element);
      document.addEventListener('daybook:navigation-loading', () => {
        if (document.documentElement.dataset.navigationLoading === 'true') liquid.start();
        else liquid.stop();
      });
      window.fixture = { loading, liquid };
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<div data-daybook-page></div><div class="daybook-cursor"></div>');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.addScriptTag({ content: outputFiles[0].text });
  const state = () => page.evaluate(() => ({
    pending: document.documentElement.dataset.navigationPending === 'true',
    feedback: document.documentElement.dataset.navigationLoading === 'true',
    liquid: document.querySelector('.daybook-cursor').classList.contains('is-loading'),
    path: document.querySelector('path').getAttribute('d'),
  }));
  const start = id => page.evaluate(id => window.fixture.loading.start(id), id);
  const finish = id => page.evaluate(id => window.fixture.loading.finish(id), id);

  await start(1);
  await page.clock.runFor(399);
  assert.equal((await state()).feedback, false, 'Sub-400ms requests stay quiet');
  await finish(1);
  await page.clock.runFor(500);
  assert.equal((await state()).liquid, false, 'Finished requests cannot show late feedback');

  await start(2);
  await page.clock.runFor(400);
  assert.equal((await state()).liquid, true, 'A pending request shows feedback at 400ms');
  await page.clock.runFor(50);
  await finish(2);
  assert.equal((await state()).pending, false, 'Cursor settlement does not prolong pending navigation');
  assert.equal((await state()).feedback, false, 'Other feedback ends immediately');
  await page.clock.runFor(249);
  assert.equal((await state()).liquid, true, 'The visible entrance is allowed to finish');
  await page.clock.runFor(1);
  assert.equal((await state()).liquid, false, 'Exit begins after the 300ms entrance');

  // Re-enter while shrinking: obsolete exit cleanup must not reset the loop.
  await page.clock.runFor(100);
  await page.evaluate(() => window.fixture.liquid.start());
  await page.clock.runFor(250);
  assert.equal((await state()).liquid, true);
  const path = (await state()).path;
  await page.clock.runFor(90);
  assert.notEqual((await state()).path, path, 'The loop keeps playing after interrupted exit');

  await page.evaluate(() => { window.fixture.liquid.reset(); window.fixture.liquid.start(); });
  await page.clock.runFor(50);
  await page.evaluate(() => window.fixture.liquid.stop());
  await page.clock.runFor(50);
  await page.evaluate(() => window.fixture.liquid.start());
  await page.clock.runFor(600);
  assert.equal((await state()).liquid, true, 'Re-entry cancels the pending entrance settlement');
  await page.evaluate(() => window.fixture.liquid.stop(true));
  assert.equal((await state()).liquid, false, 'Hidden/disabled cursors can stop immediately');
  await page.clock.runFor(600);
  assert.equal((await state()).liquid, false, 'Cleanup cannot revive a stopped cursor');
  await page.evaluate(() => window.fixture.liquid.destroy());
  console.log('Loading feedback timing passed: threshold, fast completion, entrance settlement, re-entry and cleanup.');
} finally {
  await browser.close();
}
