import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const isWatch = process.argv.includes('--watch');

// Ensure assets/ts exists, or the script will fail if run before migration
if (!fs.existsSync(path.join(root, 'assets/ts'))) {
  console.log('No assets/ts directory found. Skipping JS build.');
  process.exit(0);
}

// Find all .ts files directly in assets/ts/
const tsFiles = fs.readdirSync(path.join(root, 'assets', 'ts'))
  .filter(file => file.endsWith('.ts'))
  .map(file => path.join(root, 'assets', 'ts', file));

if (tsFiles.length === 0) {
  console.log('No .ts files found in assets/ts. Skipping JS build.');
  process.exit(0);
}

const buildOptions = {
  entryPoints: tsFiles,
  outdir: path.join(root, 'static', 'js'),
  bundle: true, // Enable bundling so imported modules like embed-loading.ts are inlined
  sourcemap: true,
  format: 'esm', // Standard output format
  target: ['es2020'],
  logLevel: 'info',
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for TS changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('JS Build complete.');
  }
}

run().catch(() => process.exit(1));
