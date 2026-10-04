#!/usr/bin/env bash
set -euo pipefail

echo "==> Phase A: Dependency and Frontend Validation"
if [ -z "${CI:-}" ]; then npm ci; fi
npm run typecheck
npm run test:reading-rail
npm run build:js
npm run build:vendor
npm run test:giscus
node scripts/graph-browser-test.mjs
node scripts/gallery-browser-test.mjs

echo "==> Phase B: Go Validation"
go test ./...

TEMP_DIR=$(mktemp -d)

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "${TEMP_DIR:-}"
}
trap cleanup EXIT INT TERM

DAYBOOK_BIN="$TEMP_DIR/daybook-bin"
echo "==> Building Daybook binary to $DAYBOOK_BIN"
go build -o "$DAYBOOK_BIN" ./cmd/daybook

echo "==> Phase C: Standalone Smoke Test"
VAULT_DIR="$TEMP_DIR/vault"
mkdir -p "$VAULT_DIR/vault/notes"
mkdir -p "$VAULT_DIR/vault/memos"
mkdir -p "$VAULT_DIR/vault/pages"

cat << 'YAML' > "$VAULT_DIR/daybook.yaml"
site:
  url: https://example.com
profile:
  author:
    logoText: Smoke Test Vault
YAML

cat << 'ABOUT' > "$VAULT_DIR/vault/pages/about.md"
---
title: "About"
---
ABOUT

cat << 'MD' > "$VAULT_DIR/vault/notes/smoke-test.md"
---
date: "2026-08-24"
math: true
---
Hello World from the smoke test!

Related short entry: [[memos/smoke-memo]].

## Heading 1
Line of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\nLine of text.\n\n

## Heading 2
This is a test of KaTeX inline $E=mc^2$ and display:
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

More text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\nMore text.\n\n

## Heading 3
More content here.

Even more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\nEven more text.\n\n

## Heading 4
End of document.
MD

cat << 'MD' > "$VAULT_DIR/vault/memos/smoke-memo.md"
---
date: "2026-10-02T18:30:00+08:00"
tags: [smoke, daily]
location: Riverside
---
A short memo from the smoke test, linked to [[notes/smoke-test]].

- [x] Publish a short entry without a title property.
- [ ] Keep writing.
MD

cat << 'MD' > "$VAULT_DIR/vault/memos/draft-memo.md"
---
date: "2026-10-02"
draft: true
---
Unpublished memo body must stay private.
MD

cat << 'MD' > "$VAULT_DIR/vault/memos/invalid-memo.md"
---
date: "not-a-date"
---
Invalid memo body must not be published.
MD

cd "$VAULT_DIR"
echo "==> Running daybook build in temporary vault"
"$DAYBOOK_BIN" build

echo "==> Asserting generated assets"
if [ ! -f "public/index.html" ]; then
    echo "ERROR: public/index.html is missing"
    exit 1
fi
node --input-type=module <<'JS'
import { readFileSync, existsSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('public/assets-manifest.json', 'utf8'));
for (const asset of [
  '/js/giscus-loader.js',
  ...['default', 'warm'].flatMap(palette => ['light', 'dark'].map(theme => `/css/components/giscus-${palette}-${theme}.css`)),
]) {
  if (!manifest[asset] || !existsSync(`public${manifest[asset]}`)) throw new Error(`Missing giscus asset: ${asset}`);
}
if (JSON.stringify(manifest).toLowerCase().includes('waline') || existsSync('public/vendor/waline')) {
  throw new Error('Obsolete Waline assets were emitted');
}
for (const route of ['memos', 'en_US/memos', 'memos/smoke-memo']) {
  if (!existsSync(`public/${route}/index.html`)) throw new Error(`Missing memos page: ${route}`);
}
const timeline = readFileSync('public/memos/index.html', 'utf8');
if (!timeline.includes('A short memo from the smoke test') || !timeline.includes('Riverside')) {
  throw new Error('Memos timeline is missing body or location');
}
const search = JSON.parse(readFileSync('public/search.json', 'utf8'));
const versions = search.flatMap(item => Object.values(item.versions));
for (const url of ['/notes/smoke-test/', '/memos/smoke-memo/']) {
  if (!versions.some(item => item.url === url)) throw new Error(`Search index is missing ${url}`);
}
if (versions.find(item => item.url === '/notes/smoke-test/').title !== 'smoke-test') {
  throw new Error('Note title was not derived from its filename');
}
const graph = JSON.parse(readFileSync('public/graph.json', 'utf8'));
const note = graph.nodes.find(node => node.url === '/notes/smoke-test/');
const memo = graph.nodes.find(node => node.url === '/memos/smoke-memo/');
if (!note || !memo || !graph.links.some(link =>
  (link.source === note.id && link.target === memo.id) ||
  (link.source === memo.id && link.target === note.id))) {
  throw new Error('Notes and memos are not connected in the shared graph');
}
for (const slug of ['draft-memo', 'invalid-memo']) {
  if (existsSync(`public/memos/${slug}/index.html`) ||
      JSON.stringify(search).includes(slug) || JSON.stringify(graph).includes(slug) || timeline.includes(slug)) {
    throw new Error(`Excluded memo leaked into published output: ${slug}`);
  }
}
JS
if [ ! -f "public/vendor/katex/katex.js" ] || [ ! -f "public/vendor/katex/katex.min.css" ]; then
    echo "ERROR: KaTeX assets are missing"
    exit 1
fi
if [ ! -d "public/vendor/fonts" ]; then
    echo "ERROR: Vendor fonts are missing"
    exit 1
fi

echo "==> Checking for source leaks in generated assets"
# Release scripts are minified; external source maps must not be shipped.
if find public -name "*.js.map" | grep -q .; then
    echo "ERROR: Found external .js.map in generated JS"
    exit 1
fi

echo "==> Starting Daybook dev server"
DAYBOOK_TEST_PORT="${DAYBOOK_TEST_PORT:-$(node --input-type=module -e 'import { createServer } from "node:net"; const server = createServer(); server.listen(0, "127.0.0.1", () => { process.stdout.write(String(server.address().port)); server.close(); });')}"
export DAYBOOK_TEST_URL="http://127.0.0.1:$DAYBOOK_TEST_PORT"
"$DAYBOOK_BIN" serve --addr "127.0.0.1:$DAYBOOK_TEST_PORT" &
SERVER_PID=$!

max_attempts=20
attempt=1
ready=0
while [ $attempt -le $max_attempts ]; do
  sleep 0.2
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "ERROR: Daybook test server failed to start on port $DAYBOOK_TEST_PORT."
    echo "Choose an available DAYBOOK_TEST_PORT before running ./scripts/check.sh."
    exit 1
  fi
  
  if curl -s -f "$DAYBOOK_TEST_URL/" > /dev/null; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
done

sleep 0.2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "ERROR: Daybook test server exited unexpectedly."
  exit 1
fi

if [ $ready -eq 0 ]; then
  echo "ERROR: Daybook test server did not become ready in time."
  exit 1
fi

echo "==> Phase D: Browser Runtime Regression Test"
cd - > /dev/null
node scripts/browser-test.mjs
node scripts/memos-browser-test.mjs
node scripts/article-actions-browser-test.mjs

echo "==> All checks passed successfully!"
