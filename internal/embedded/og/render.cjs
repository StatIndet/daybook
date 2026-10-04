// Local build-time renderer. This file is embedded into the standalone CLI.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ORIGIN = 'https://daybook-og.invalid';
const CARD_TIMEOUT = 30_000;
const CONTENT_TYPES = {
  '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

function within(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function assetPath(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) {
    throw new Error(`unsafe local asset path: ${pathname}`);
  }
  const filename = path.resolve(root, `.${decoded}`);
  if (!within(root, filename)) throw new Error(`asset is outside public directory: ${pathname}`);
  const resolved = await fs.realpath(filename);
  if (!within(root, resolved)) throw new Error(`asset symlink is outside public directory: ${pathname}`);
  return resolved;
}

async function outputPath(root, card) {
  if (!['notes', 'memos'].includes(card.section) || !new RegExp(`^/generated/og/${card.section}/[a-zA-Z0-9][a-zA-Z0-9_-]*\\.png$`).test(card.outputPath)) {
    throw new Error(`unsafe output path: ${card.outputPath}`);
  }
  // Resolve each parent before creating the next so an existing symlink cannot
  // redirect either directory creation or image writes outside public/.
  let parent = root;
  for (const component of ['generated', 'og', card.section]) {
    parent = path.join(parent, component);
    await fs.mkdir(parent, { recursive: true });
    parent = await fs.realpath(parent);
    if (!within(root, parent)) throw new Error(`output symlink is outside public directory: ${card.outputPath}`);
  }
  return path.join(parent, path.basename(card.outputPath));
}

async function renderCard(browser, root, card, assets) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1,
    colorScheme: 'light', reducedMotion: 'reduce', locale: 'zh-CN',
    timezoneId: 'UTC', javaScriptEnabled: false, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(CARD_TIMEOUT);
  const failures = new Set();
  const documentURL = new URL(card.pageURL, ORIGIN).href;
  await page.route('**/*', async (route, request) => {
    try {
      const url = new URL(request.url());
      if (request.isNavigationRequest() && request.url() === documentURL) {
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: card.html });
      } else if (url.origin === ORIGIN) {
        if (!assets.has(request.url())) {
          assets.set(request.url(), (async () => {
            const filename = await assetPath(root, url.pathname);
            return { body: await fs.readFile(filename), contentType: CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream' };
          })());
        }
        await route.fulfill(await assets.get(request.url()));
      } else if (request.resourceType() === 'image' && ['http:', 'https:'].includes(url.protocol)) {
        if (!assets.has(request.url())) {
          assets.set(request.url(), (async () => {
            const response = await route.fetch({ timeout: 15_000, maxRedirects: 5 });
            try {
              if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
              return { body: await response.body(), contentType: response.headers()['content-type'] || 'application/octet-stream' };
            } finally {
              await response.dispose();
            }
          })());
        }
        await route.fulfill(await assets.get(request.url()));
      } else {
        throw new Error(`unsupported external ${request.resourceType()} request`);
      }
    } catch (error) {
      failures.add(`${request.url()}: ${error.message}`);
      await route.abort().catch(() => {});
    }
  });
  page.on('requestfailed', request => failures.add(`${request.url()}: ${request.failure()?.errorText || 'request failed'}`));
  let timer;
  try {
    const work = async () => {
      await page.goto(documentURL, { waitUntil: 'load', timeout: CARD_TIMEOUT });
      await page.evaluate(async () => {
        await document.fonts.ready;
        const brokenFonts = [...document.fonts].filter(font => font.status === 'error');
        if (brokenFonts.length) throw new Error(`font failed to load: ${brokenFonts.map(font => font.family).join(', ')}`);
        await Promise.all([...document.images].map(async image => {
          try { await image.decode(); }
          catch { throw new Error(`image failed to decode: ${image.currentSrc || image.src}`); }
          if (!image.naturalWidth) throw new Error(`image has no pixels: ${image.currentSrc || image.src}`);
        }));
      });
      if (failures.size) throw new Error([...failures].join('\n'));
      const filename = await outputPath(root, card);
      const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'hide', timeout: CARD_TIMEOUT });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, png, { flag: 'wx', mode: 0o644 });
        await fs.rename(temporary, filename);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    };
    await Promise.race([
      work(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`card exceeded ${CARD_TIMEOUT / 1000}s time limit`)), CARD_TIMEOUT); }),
    ]);
  } catch (error) {
    throw new Error(`OG ${card.pageURL} (${card.outputPath}): ${error.message}${failures.size ? `\nAssets: ${[...failures].join('\n')}` : ''}`);
  } finally {
    clearTimeout(timer);
    await context.close();
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  const root = await fs.realpath(manifest.publicDir);
  const loaded = await import(pathToFileURL(manifest.module).href);
  const chromium = loaded.chromium || loaded.default?.chromium;
  if (!chromium) throw new Error(`Playwright module has no Chromium renderer: ${manifest.module}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 30_000 });
  } catch (error) {
    throw new Error(`Cannot launch OG Chromium. Run \`daybook setup-og\`; on Linux, install the browser's OS libraries if needed. ${error.message}`);
  }
  try {
    const assets = new Map();
    for (const [index, card] of manifest.cards.entries()) {
      process.stderr.write(`OG [${index + 1}/${manifest.cards.length}] ${card.pageURL}\n`);
      await renderCard(browser, root, card, assets);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { assetPath, outputPath };
if (require.main === module) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
