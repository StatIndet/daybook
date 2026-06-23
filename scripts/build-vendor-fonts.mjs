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

// Copy LXGW WenKai Regular
await copyDirClean(
  path.join(root, "node_modules", "@chinese-fonts", "lxgwwenkai", "dist", "LXGWWenKai-Regular"),
  path.join(root, "static", "vendor", "fonts", "lxgwwenkai", "regular"),
);

// Copy Maple Mono CN Regular
await copyDirClean(
  path.join(root, "node_modules", "@chinese-fonts", "maple-mono-cn", "dist", "MapleMono-CN-Regular"),
  path.join(root, "static", "vendor", "fonts", "maple-mono-cn", "regular"),
);

// Copy Maple Mono CN Italic
await copyDirClean(
  path.join(root, "node_modules", "@chinese-fonts", "maple-mono-cn", "dist", "MapleMono-CN-Italic"),
  path.join(root, "static", "vendor", "fonts", "maple-mono-cn", "italic"),
);

// Copy Material Symbols Rounded
await copyFileClean(
  path.join(root, "node_modules", "material-symbols", "material-symbols-rounded.woff2"),
  path.join(root, "static", "vendor", "fonts", "material-symbols", "material-symbols-rounded.woff2"),
);

console.log("Vendor fonts copied successfully.");
