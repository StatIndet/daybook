import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [mode, url, ...extra] = process.argv.slice(2);
const usage = `Optional TOC diagnostics (never run by check.sh or CI):
  npm run test:toc                    Geometry and Chromium pixel checks
  npm run test:toc -- --article URL   Also check a built article's desktop/mobile TOC
  npm run test:toc -- --vault URL     Also check the existing bilingual vault fixtures

Install prerequisites explicitly: npm ci && npx playwright install chromium
See scripts/manual/toc/GUIDE.md for fixture requirements and limitations.`;

if (mode === '--help') {
  console.log(usage);
  process.exit(0);
}
if (mode && (!['--article', '--vault'].includes(mode) || !url || extra.length)) {
  console.error(usage);
  process.exit(1);
}
if (url && !['http:', 'https:'].includes(new URL(url).protocol)) {
  throw new Error('Supply an http:// or https:// URL for a locally served vault.');
}

function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, stdio: 'inherit', env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['--test', 'scripts/manual/toc/reading-rail.mjs']);
if (mode === '--article') {
  run(['scripts/manual/toc/browser.mjs'], { DAYBOOK_TOC_ARTICLE_URL: url });
} else if (mode === '--vault') {
  run(['scripts/vault-browser-test.mjs'], { DAYBOOK_TEST_BASE_URL: url, DAYBOOK_TEST_FILTER: 'TOC' });
}
