import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const isWatch = process.argv.includes('--watch');

const tsFiles = fs.readdirSync(path.join(root, 'assets', 'ts'))
  .filter(file => file.endsWith('.ts'))
  .map(file => path.join(root, 'assets', 'ts', file));

const buildOptions = {
  entryPoints: tsFiles,
  outdir: path.join(root, 'internal', 'embedded', 'static', 'js'),
  bundle: true,
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  format: 'esm',
  target: ['es2020'],
  external: ['/vendor/*'],
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
