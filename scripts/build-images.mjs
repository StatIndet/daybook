import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'internal', 'embedded', 'static', 'images', 'settings-paper.webp');
const result = await sharp(path.join(root, 'assets', 'images', 'settings-paper.png'))
  .webp({ quality: 78, effort: 6 })
  .toFile(target);
console.log(`Settings/share paper: ${result.width}×${result.height}, ${result.size} bytes (loaded on opening).`);
