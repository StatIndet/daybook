import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { outputFiles } = await build({
  entryPoints: [path.join(root, 'assets/ts/giscus-loader.ts')],
  bundle: true, format: 'esm', target: 'es2020', write: false,
});
const stylesheet = await readFile(path.join(root, 'internal/embedded/static/css/pages/note.css'), 'utf8');
const widget = term => `<div id="giscus" data-repo="StatIndet/giscus" data-repo-id="R_kgDOU4xqeQ" data-category="Announcements" data-category-id="DIC_kwDOU4xqec4DG4Zb" data-path="${term}" data-theme-default-light="/css/components/giscus-default-light.123456.css" data-theme-default-dark="/css/components/giscus-default-dark.123456.css" data-theme-warm-light="/css/components/giscus-warm-light.123456.css" data-theme-warm-dark="/css/components/giscus-warm-dark.123456.css"></div>`;
const server = createServer((request, response) => {
  if (request.url === '/loader.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(outputFiles[0].text);
    return;
  }
  const url = new URL(request.url, 'http://localhost');
  const term = url.pathname.replace(/^\/en_US(?=\/)/, '');
  const lang = url.searchParams.get('ui') === 'en_US' || url.pathname.startsWith('/en_US/') ? 'en-US' : 'zh-CN';
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html lang="${lang}" data-theme="light" data-palette="default"><head><meta name="description" content="Test article"><style>body{margin:0}main{width:640px;margin:auto}#spacer{height:3000px}${stylesheet}</style><script>history.replaceState({testState:42},'',location.href);try{if(JSON.parse(localStorage.getItem('daybook:user-settings')||'{}').disableComments)document.documentElement.dataset.commentsDisabled='true'}catch{}</script></head><body><main><div id="spacer"></div>${widget(term)}</main><script type="module" src="/loader.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (new URL(request.url()).origin === 'https://giscus.app') requests.push(request.url());
});
let delayNextWidget = false;
let delayNextHydration = false;
let releaseWidget = null;
await context.route('https://giscus.app/**', async route => {
  const hydrationDelay = delayNextHydration ? 100 : 0;
  delayNextHydration = false;
  if (delayNextWidget) {
    delayNextWidget = false;
    await new Promise(resolve => { releaseWidget = resolve; });
  }
  try {
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>Mock comments<script>
      window.received=[];
      const host=new URL(new URL(location.href).searchParams.get('origin')).origin;
      setTimeout(()=>{
        addEventListener('message',event=>{if(event.origin===host && event.data?.giscus?.setConfig)window.received.push(event.data.giscus.setConfig)});
        parent.postMessage({giscus:{resizeHeight:320}},host);
      },${hydrationDelay});
    </script></body></html>` });
  } catch (error) {
    // A cancelled iframe navigation may finish after its page has left.
    if (!/closed|cancelled|disposed/i.test(error.message)) throw error;
  }
});
await page.addInitScript(() => {
  window.observers = { intersection: [], mutation: [] };
  for (const [name, key] of [['IntersectionObserver', 'intersection'], ['MutationObserver', 'mutation']]) {
    const Native = window[name];
    window[name] = class extends Native {
      constructor(callback, options) {
        super(callback, options);
        this.record = { callback, observer: this, disconnected: false };
        window.observers[key].push(this.record);
      }
      disconnect() {
        this.record.disconnected = true;
        super.disconnect();
      }
      observe(target, options) {
        this.record.widget = key === 'mutation'
          ? target === document.documentElement && options?.attributeFilter?.includes('data-theme')
          : target.id === 'giscus';
        super.observe(target, options);
      }
    };
  }
});

const frame = () => page.frames().find(candidate => candidate.url().startsWith('https://giscus.app/'));
const activeObservers = () => page.evaluate(() => Object.fromEntries(Object.entries(window.observers).map(([key, entries]) => [key, entries.filter(entry => entry.widget && !entry.disconnected).length])));
async function mounted() {
  await page.waitForSelector('#giscus iframe');
  await page.waitForFunction(() => !document.querySelector('#giscus iframe').classList.contains('giscus-frame--loading'));
  await page.waitForFunction(() => document.querySelector('#giscus iframe').style.height === '320px');
}
async function pendingWidget() {
  const deadline = Date.now() + 5000;
  while (!releaseWidget && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert(releaseWidget, 'The delayed widget request started');
}
async function switchPage(term, route = term, visible = false) {
  await page.evaluate(({ markup, route, visible }) => {
    window.previousContainer = document.getElementById('giscus');
    window.previousFrame = document.querySelector('#giscus iframe');
    document.dispatchEvent(new Event('daybook:before-swap'));
    document.querySelector('main').innerHTML = `<div id="spacer" style="height:${visible ? '0' : '3000px'}"></div>${markup}`;
    history.pushState(history.state, '', route);
    window.scrollTo(0, 0);
    document.dispatchEvent(new Event('daybook:page-load'));
  }, { markup: widget(term), route, visible });
}

try {
  await page.goto(`${base}/notes/first/?ui=en_US&giscus=oauth-token#heading`, { waitUntil: 'networkidle' });
  assert.equal(requests.length, 0, 'Offscreen comments make no third-party requests');
  assert.equal(await page.locator('#giscus iframe').count(), 0, 'The lazy widget is absent until visible');
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), JSON.stringify('oauth-token'));
  assert.equal(await page.evaluate(() => history.state.testState), 42, 'OAuth cleanup preserves router state');
  assert(!page.url().includes('giscus='));
  assert(page.url().endsWith('?ui=en_US#heading'), 'OAuth cleanup preserves interface language and reader fragment');

  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  assert.equal(requests.length, 1);
  const params = new URL(requests[0]).searchParams;
  assert.equal(params.get('repo'), 'StatIndet/giscus');
  assert.equal(params.get('repoId'), 'R_kgDOU4xqeQ');
  assert.equal(params.get('category'), 'Announcements');
  assert.equal(params.get('categoryId'), 'DIC_kwDOU4xqec4DG4Zb');
  assert.equal(params.get('term'), '/notes/first/');
  assert.equal(params.get('strict'), '1');
  assert.equal(params.get('reactionsEnabled'), '0');
  assert.equal(params.get('emitMetadata'), '0');
  assert.equal(params.get('inputPosition'), 'top');
  assert.equal(params.get('session'), 'oauth-token');
  assert.equal(params.get('origin'), `${base}/notes/first/?ui=en_US#giscus`);
  assert.equal(params.get('theme'), `${base}/css/components/giscus-default-light.123456.css`);
  assert.equal(new URL(requests[0]).pathname, '/en/widget');
  assert.equal(await page.locator('#giscus iframe').getAttribute('allow'), 'clipboard-write; local-network-access; loopback-network', 'Loopback previews delegate access to their local themes');
  assert(await page.locator('#giscus').evaluate(container => Math.abs(container.clientWidth - container.querySelector('iframe').getBoundingClientRect().width) < 1), 'The frame fills the comments container');
  await page.evaluate(() => { window.initialFrame = document.querySelector('#giscus iframe'); });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.palette = 'warm';
    document.documentElement.lang = 'zh-CN';
    for (let i = 0; i < 4; i++) document.dispatchEvent(new Event('daybook:settings-change'));
    document.dispatchEvent(new Event('daybook:lang-change'));
  });
  await frame().waitForFunction(() => window.received.at(-1)?.lang === 'zh-CN' && window.received.at(-1)?.theme.includes('warm-dark'));
  assert.deepEqual(await frame().evaluate(() => window.received.at(-1)), { theme: `${base}/css/components/giscus-warm-dark.123456.css`, lang: 'zh-CN' });
  assert.equal(await page.locator('#giscus iframe').getAttribute('title'), '评论');
  assert(await page.evaluate(() => window.initialFrame === document.querySelector('#giscus iframe')), 'Appearance changes preserve iframe identity');
  assert.equal(requests.length, 1, 'Appearance and unrelated settings do not reload discussions');

  await page.evaluate(() => {
    const ownFrame = document.querySelector('#giscus iframe');
    for (const event of [
      new MessageEvent('message', { origin: 'https://evil.example', source: ownFrame.contentWindow, data: { giscus: { resizeHeight: 999, signOut: true } } }),
      new MessageEvent('message', { origin: 'https://giscus.app', source: window, data: { giscus: { resizeHeight: 999, signOut: true } } }),
      new MessageEvent('message', { origin: 'https://giscus.app', source: ownFrame.contentWindow, data: null }),
      new MessageEvent('message', { origin: 'https://giscus.app', source: ownFrame.contentWindow, data: { giscus: { resizeHeight: '999' } } }),
    ]) window.dispatchEvent(event);
  });
  assert.equal(await page.locator('#giscus iframe').evaluate(element => element.style.height), '320px');
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), JSON.stringify('oauth-token'), 'Forged messages cannot clear authentication');
  await frame().evaluate(() => parent.postMessage({ giscus: { resizeHeight: 420.2 } }, new URL(new URL(location.href).searchParams.get('origin')).origin));
  await page.waitForFunction(() => document.querySelector('#giscus iframe').style.height === '421px');
  await frame().evaluate(() => parent.postMessage({ giscus: { signOut: true } }, new URL(new URL(location.href).searchParams.get('origin')).origin));
  await mounted();
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), null);
  assert.equal(new URL(requests.at(-1)).searchParams.get('session'), '');
  assert(await page.evaluate(() => window.initialFrame === document.querySelector('#giscus iframe')), 'Logout reloads the current iframe');

  await switchPage('/notes/pending/');
  assert.deepEqual(await activeObservers(), { intersection: 1, mutation: 1 }, 'A content swap cleans up the old controller');
  const pendingRequestCount = requests.length;
  await page.evaluate(() => {
    window.pendingContainer = document.getElementById('giscus');
    window.pendingIntersection = window.observers.intersection.at(-1);
    document.documentElement.dataset.commentsDisabled = 'true';
    document.dispatchEvent(new Event('daybook:settings-change'));
    window.pendingIntersection.callback([{ isIntersecting: true, target: window.pendingContainer }]);
  });
  assert.deepEqual(await activeObservers(), { intersection: 0, mutation: 0 }, 'Disabling comments disconnects all widget observers');
  assert.equal(await page.locator('#giscus iframe').count(), 0, 'A stale visibility callback cannot bypass the preference');
  assert.equal(requests.length, pendingRequestCount);
  await page.evaluate(() => {
    delete document.documentElement.dataset.commentsDisabled;
    document.dispatchEvent(new Event('daybook:settings-change'));
    for (let i = 0; i < 4; i++) document.dispatchEvent(new Event('daybook:page-load'));
  });
  assert.deepEqual(await activeObservers(), { intersection: 1, mutation: 1 });
  await switchPage('/notes/translated/', '/en_US/notes/translated/');
  await page.evaluate(() => {
    window.pendingIntersection.callback([{ isIntersecting: true, target: window.pendingContainer }]);
    document.documentElement.lang = 'en-US';
  });
  assert.equal(requests.length, pendingRequestCount, 'A stale observer cannot mount the previous article');
  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  assert.equal(new URL(requests.at(-1)).searchParams.get('term'), '/notes/translated/', 'Translated UI routes use the backend comment path');
  assert.equal(await page.locator('#giscus iframe').count(), 1, 'Repeated SPA events never duplicate the iframe');
  await page.evaluate(() => {
    document.dispatchEvent(new Event('daybook:before-swap'));
    document.documentElement.dataset.commentsDisabled = 'true';
    document.dispatchEvent(new Event('daybook:settings-change'));
    delete document.documentElement.dataset.commentsDisabled;
    document.dispatchEvent(new Event('daybook:settings-change'));
    document.querySelector('main').innerHTML = '<h1>Index without comments</h1>';
    history.pushState(history.state, '', '/notes/');
    document.dispatchEvent(new Event('daybook:page-load'));
  });
  assert.deepEqual(await activeObservers(), { intersection: 0, mutation: 0 });
  assert.equal(await page.locator('iframe').count(), 0, 'Leaving articles releases the iframe');

  delayNextWidget = true;
  delayNextHydration = true;
  await switchPage('/notes/loading/', '/notes/loading/', true);
  await page.waitForFunction(() => !!document.querySelector('#giscus iframe'));
  await pendingWidget();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.palette = 'default';
    document.documentElement.lang = 'zh-CN';
  });
  releaseWidget();
  releaseWidget = null;
  await mounted();
  await frame().waitForFunction(() => window.received.at(-1)?.theme.includes('default-light') && window.received.at(-1)?.lang === 'zh-CN');
  assert.equal(new URL(requests.at(-1)).pathname, '/en/widget', 'The test changed language while the original request was loading');
  assert(await page.evaluate(() => document.querySelector('#giscus iframe').title === '评论'), 'The delayed widget receives the newest appearance');

  delayNextWidget = true;
  await switchPage('/notes/leaving-during-load/', '/notes/leaving-during-load/', true);
  await pendingWidget();
  await page.evaluate(() => {
    window.loadingFrame = document.querySelector('#giscus iframe');
    window.loadingWindow = window.loadingFrame.contentWindow;
  });
  await switchPage('/notes/replacement/', '/notes/replacement/?giscus=replacement-session', true);
  await mounted();
  releaseWidget();
  releaseWidget = null;
  await page.evaluate(() => {
    window.loadingFrame.dispatchEvent(new Event('load'));
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://giscus.app', source: window.loadingWindow,
      data: { giscus: { error: 'State has expired', resizeHeight: 999 } },
    }));
  });
  assert(await page.evaluate(() => !window.loadingFrame.isConnected && window.loadingFrame.classList.contains('giscus-frame--loading')), 'Leaving aborts the unfinished load listener');
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), JSON.stringify('replacement-session'), 'Messages from a discarded iframe cannot clear the current session');
  assert.equal(new URL(await page.locator('#giscus iframe').getAttribute('src')).searchParams.get('term'), '/notes/replacement/');
  assert.equal(await page.locator('#giscus iframe').count(), 1);

  await page.evaluate(() => localStorage.setItem('daybook:user-settings', JSON.stringify({ disableComments: true })));
  const disabledRequests = requests.length;
  await page.goto(`${base}/notes/disabled/`, { waitUntil: 'networkidle' });
  await page.locator('#giscus').evaluate(element => element.scrollIntoView());
  assert.equal(await page.locator('#giscus iframe').count(), 0);
  assert.equal(requests.length, disabledRequests, 'The saved disable-comments preference prevents all giscus requests');
  assert.deepEqual(await activeObservers(), { intersection: 0, mutation: 0 });

  await page.evaluate(() => {
    localStorage.removeItem('daybook:user-settings');
    localStorage.setItem('giscus-session', '{bad-json');
  });
  await page.goto(`${base}/notes/invalid-session/`, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), null, 'Malformed saved sessions are cleared safely');
  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  assert.equal(new URL(requests.at(-1)).searchParams.get('session'), '');

  await page.goto(`${base}/notes/expired-session/?giscus=expired-session`, { waitUntil: 'networkidle' });
  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  await frame().evaluate(() => parent.postMessage({ giscus: { error: 'State has expired' } }, new URL(new URL(location.href).searchParams.get('origin')).origin));
  await mounted();
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), null, 'Expired authentication is cleared and retried anonymously');
  assert.equal(new URL(requests.at(-1)).searchParams.get('session'), '');

  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto(`${base}/notes/private-storage/?giscus=memory-session`, { waitUntil: 'networkidle' });
  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  assert.equal(new URL(requests.at(-1)).searchParams.get('session'), 'memory-session', 'OAuth still works when browser storage is unavailable');
  assert(!page.url().includes('giscus='));

  await context.route('https://daybook.example/**', async route => {
    const isModule = new URL(route.request().url()).pathname === '/loader.js';
    await route.fulfill({
      contentType: isModule ? 'text/javascript' : 'text/html',
      body: isModule ? outputFiles[0].text : await (await fetch(`${base}/notes/public/`)).text(),
    });
  });
  await page.goto('https://daybook.example/notes/public/', { waitUntil: 'networkidle' });
  await page.locator('#giscus').scrollIntoViewIfNeeded();
  await mounted();
  assert.equal(await page.locator('#giscus iframe').getAttribute('allow'), 'clipboard-write', 'Public sites do not delegate local-network permissions');
  assert.deepEqual(errors, []);
  console.log('Giscus browser tests passed: lazy loading, OAuth, strict mapping, iframe sizing, themes, locale, trusted messages, loading races, preferences and SPA cleanup.');
} finally {
  releaseWidget?.();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
