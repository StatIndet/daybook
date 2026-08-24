import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const walineSrc = path.join(root, 'node_modules', '@waline', 'client', 'dist');
const walineDest = path.join(root, 'internal', 'embedded', 'static', 'vendor', 'waline');

async function run() {
  await fs.rm(walineDest, { recursive: true, force: true });
  await fs.mkdir(walineDest, { recursive: true });
  
  const filesToCopy = [
    'waline.css',
    'waline.js',
    'waline-meta.css'
  ];
  
  for (const file of filesToCopy) {
    try {
      await fs.copyFile(path.join(walineSrc, file), path.join(walineDest, file));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  
  console.log('Waline vendor assets copied successfully.');
}

run().catch(console.error);
