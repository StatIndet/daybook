import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const katexSrc = path.join(root, 'node_modules', 'katex', 'dist');
const katexDest = path.join(root, 'internal', 'embedded', 'static', 'vendor', 'katex');

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function run() {
  await fs.rm(katexDest, { recursive: true, force: true });
  await fs.mkdir(katexDest, { recursive: true });
  
  // Copy fonts directory
  await copyDir(path.join(katexSrc, 'fonts'), path.join(katexDest, 'fonts'));
  
  // Copy css and js
  const filesToCopy = [
    'katex.css',
    'katex.min.css',
    'katex.js',
    'katex.min.js',
    'katex.mjs'
  ];
  
  for (const file of filesToCopy) {
    await fs.copyFile(path.join(katexSrc, file), path.join(katexDest, file));
  }
  
  console.log('KaTeX vendor assets copied successfully.');
}

run().catch(console.error);
