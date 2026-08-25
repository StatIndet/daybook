import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const isWatch = process.argv.includes('--watch');

const classicEntries = [
  'archive',
  'code-copy',
  'custom-cursor',
  'daybook-router',
  'embeds',
  'gallery',
  'graph-loader',
  'graph',
  'heading-anchors',
  'katex-loader',
  'lightbox',
  'mermaid-loader',
  'mobile-drawer',
  'mobile-toc',
  'note-bilingual',
  'note-filters',
  'page-transition-engine',
  'search-engine',
  'search-overlay',
  'theme',
  'toc'
].map(name => path.join(root, 'assets', 'ts', `${name}.ts`));

const moduleEntries = [
  'reader-mode',
  'reading-controls',
  'settings-overlay',
  'share-overlay',
  'waline-loader'
].map(name => path.join(root, 'assets', 'ts', `${name}.ts`));

const commonOptions = {
  outdir: path.join(root, 'internal', 'embedded', 'static', 'js'),
  bundle: true,
  sourcemap: isWatch ? 'inline' : false,
  minify: false, // temporarily disabled to avoid regression
  target: ['es2020'],
  external: ['/vendor/*'],
  logLevel: 'info',
};

const classicOptions = {
  ...commonOptions,
  entryPoints: classicEntries,
  format: 'iife'
};

const moduleOptions = {
  ...commonOptions,
  entryPoints: moduleEntries,
  format: 'esm'
};

async function run() {
  if (isWatch) {
    const ctxClassic = await esbuild.context(classicOptions);
    const ctxModule = await esbuild.context(moduleOptions);
    await ctxClassic.watch();
    await ctxModule.watch();
    console.log('Watching for TS changes...');
  } else {
    // clear stale JS outputs
    const jsDir = path.join(root, 'internal', 'embedded', 'static', 'js');
    if (fs.existsSync(jsDir)) {
      const files = fs.readdirSync(jsDir);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.js.map')) {
          fs.unlinkSync(path.join(jsDir, file));
        }
      }
    }
    
    await Promise.all([
      esbuild.build(classicOptions),
      esbuild.build(moduleOptions)
    ]);
    console.log('JS Build complete.');
  }
}

run().catch(() => process.exit(1));
