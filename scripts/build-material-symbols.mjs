import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as fontkit from 'fontkit';
import subsetFont from 'subset-font';

// Icon ligatures need their output glyphs as well as the name's letters.
// Subsetting just the alphabet would retain almost the entire ligature font.
async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['static', 'bundles', '.git', 'node_modules'].includes(entry.name)) files.push(...await sourceFiles(file));
    } else if (/\.(html|ts|go|css)$/.test(file) && !file.endsWith('_test.go')) {
      files.push(file);
    }
  }
  return files;
}

export async function buildMaterialSymbols(root) {
  const packageDir = path.join(root, 'node_modules', 'material-symbols');
  const catalog = await readFile(path.join(packageDir, 'index.d.ts'), 'utf8');
  const validNames = new Set([...catalog.matchAll(/"([a-z0-9_]+)"/g)].map(match => match[1]));
  const names = new Set();
  const files = [...await sourceFiles(path.join(root, 'assets', 'ts')), ...await sourceFiles(path.join(root, 'internal')), ...await sourceFiles(path.join(root, 'internal', 'embedded', 'static', 'css'))];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    // Covers templates, TS string literals/HTML, Go callouts and CSS ligatures.
    for (const match of source.matchAll(/["'`>]\s*([a-z0-9_]+)\s*["'`<]/g)) {
      if (validNames.has(match[1])) names.add(match[1]);
    }
  }
  if (!names.size) throw new Error('No Material Symbols found in source files');

  const original = await readFile(path.join(packageDir, 'material-symbols-rounded.woff2'));
  const font = fontkit.create(original);
  const codepointsByGlyph = new Map(font.characterSet.map(codepoint => [font.glyphForCodePoint(codepoint).id, codepoint]));
  const sortedNames = [...names].sort();
  const iconCodepoints = sortedNames.map(name => {
    const glyphs = font.layout(name).glyphs;
    const codepoint = glyphs.length === 1 && codepointsByGlyph.get(glyphs[0].id);
    if (!codepoint) throw new Error(`Material Symbols has no ligature/codepoint for ${name}`);
    return String.fromCodePoint(codepoint);
  }).join('');
  const subset = await subsetFont(original, sortedNames.join(' ') + iconCodepoints, {
    targetFormat: 'woff2',
    noLayoutClosure: true,
    // Preserve the animated axis. All current icons use these fixed values.
    variationAxes: { wght: 400, GRAD: 0, opsz: 24 },
  });
  const resultFont = fontkit.create(subset);
  for (const name of sortedNames) {
    const glyphs = resultFont.layout(name).glyphs;
    if (glyphs.length !== 1 || !glyphs[0].id) throw new Error(`Subset lost icon ligature ${name}`);
  }
  const fill = resultFont.variationAxes.FILL;
  if (!fill || fill.min !== 0 || fill.max !== 1) throw new Error('Subset lost animated FILL axis');
  const targetDir = path.join(root, 'internal', 'embedded', 'static', 'vendor', 'fonts', 'material-symbols');
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, 'material-symbols-rounded.woff2'), subset);
  await writeFile(path.join(targetDir, 'subset.json'), JSON.stringify({ icons: sortedNames, axes: resultFont.variationAxes, originalBytes: original.length, subsetBytes: subset.length }, null, 2) + '\n');
  console.log(`Material Symbols: ${sortedNames.length} icons, ${original.length} → ${subset.length} bytes; FILL 0..1 retained.`);
}
