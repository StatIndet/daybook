import { rm } from 'node:fs/promises';

await import('./build-vendor-fonts.mjs');
await import('./build-vendor-katex.mjs');

// Remove assets from the retired provider when rebuilding an existing checkout.
await rm(new URL('../internal/embedded/static/vendor/waline/', import.meta.url), { recursive: true, force: true });
