import { cp, copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function mustExist(file) {
  try {
    await stat(file);
  } catch {
    console.error(`Missing required font asset: ${file}`);
    console.error("Run `npm install` first.");
    process.exit(1);
  }
}

async function copyDirClean(source, target) {
  await mustExist(source);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  console.log(`Copied ${source} -> ${target}`);
}

async function copyFileClean(source, target) {
  await mustExist(source);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`Copied ${source} -> ${target}`);
}

// Copy LXGW WenKai Screen
await copyDirClean(
  path.join(root, "node_modules", "lxgw-wenkai-screen-web", "lxgwwenkaiscreen"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "lxgw-wenkai-screen", "regular"),
);

// Copy Maple Mono CN Regular
await copyDirClean(
  path.join(root, "node_modules", "@chinese-fonts", "maple-mono-cn", "dist", "MapleMono-CN-Regular"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "maple-mono-cn", "regular"),
);

// Copy Maple Mono CN Italic
await copyDirClean(
  path.join(root, "node_modules", "@chinese-fonts", "maple-mono-cn", "dist", "MapleMono-CN-Italic"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "maple-mono-cn", "italic"),
);

// Copy Material Symbols Rounded
await copyFileClean(
  path.join(root, "node_modules", "material-symbols", "material-symbols-rounded.woff2"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "material-symbols", "material-symbols-rounded.woff2"),
);

// Copy Fraunces (Italic)
await copyFileClean(
  path.join(root, "node_modules", "@fontsource", "fraunces", "files", "fraunces-latin-400-italic.woff2"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "fraunces", "fraunces-latin-400-italic.woff2"),
);

// Copy Allura (Normal)
await copyFileClean(
  path.join(root, "node_modules", "@fontsource", "allura", "files", "allura-latin-400-normal.woff2"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "allura", "allura-latin-400-normal.woff2"),
);

// Copy Noto Serif SC Variable CSS
await copyFileClean(
  path.join(root, "node_modules", "@fontsource-variable", "noto-serif-sc", "wght.css"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "noto-serif-sc", "wght.css"),
);

// Copy Noto Serif SC Variable Files
await copyDirClean(
  path.join(root, "node_modules", "@fontsource-variable", "noto-serif-sc", "files"),
  path.join(root, "internal", "embedded", "static", "vendor", "fonts", "noto-serif-sc", "files"),
);

console.log("Vendor fonts copied successfully.");
