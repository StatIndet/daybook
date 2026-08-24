import { cp, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const katexSrc = path.join(root, 'node_modules', 'katex', 'dist');
const katexDest = path.join(root, 'internal', 'embedded', 'static', 'vendor', 'katex');

const requiredFiles = [
  'katex.js',
  'katex.min.css'
];

async function mustExist(file) {
  try {
    await stat(file);
  } catch {
    console.error(`[KaTeX] Missing required asset: ${file}`);
    process.exit(1);
  }
}

async function main() {
  // Preflight
  for (const file of requiredFiles) {
    await mustExist(path.join(katexSrc, file));
  }
  await mustExist(path.join(katexSrc, 'fonts'));

  // Clean
  await rm(katexDest, { recursive: true, force: true });
  await mkdir(katexDest, { recursive: true });
  
  // Copy files
  for (const file of requiredFiles) {
    await copyFile(path.join(katexSrc, file), path.join(katexDest, file));
  }
  // Copy fonts
  await cp(path.join(katexSrc, 'fonts'), path.join(katexDest, 'fonts'), { recursive: true });
  
  console.log('KaTeX vendor assets copied successfully.');
}

await main();
