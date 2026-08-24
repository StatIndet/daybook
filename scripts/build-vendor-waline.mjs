import { cp, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const walineSrc = path.join(root, 'node_modules', '@waline', 'client', 'dist');
const walineDest = path.join(root, 'internal', 'embedded', 'static', 'vendor', 'waline');

const filesToCopy = [
  'waline.css',
  'waline.js'
];

async function mustExist(file) {
  try {
    await stat(file);
  } catch {
    console.error(`[Waline] Missing required asset: ${file}`);
    process.exit(1);
  }
}

async function main() {
  // Preflight: ensure all sources exist
  for (const file of filesToCopy) {
    await mustExist(path.join(walineSrc, file));
  }

  // Clean destination
  await rm(walineDest, { recursive: true, force: true });
  await mkdir(walineDest, { recursive: true });
  
  // Copy
  for (const file of filesToCopy) {
    await copyFile(path.join(walineSrc, file), path.join(walineDest, file));
  }
  
  console.log('Waline vendor assets copied successfully.');
}

await main();
