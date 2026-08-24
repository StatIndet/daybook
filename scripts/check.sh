#!/usr/bin/env bash
set -euo pipefail

echo "==> Phase A: Dependency and Frontend Validation"
npm ci
npm run typecheck
npm run test:reading-rail
npm run build:js
npm run build:vendor

echo "==> Phase B: Go Validation"
go test ./...

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

DAYBOOK_BIN="$TEMP_DIR/daybook-bin"
echo "==> Building Daybook binary to $DAYBOOK_BIN"
go build -o "$DAYBOOK_BIN" ./cmd/daybook

echo "==> Phase C: Standalone Smoke Test"
VAULT_DIR="$TEMP_DIR/vault"
mkdir -p "$VAULT_DIR/notes"
mkdir -p "$VAULT_DIR/pages"

cat << 'YAML' > "$VAULT_DIR/daybook.yaml"
site:
  title: Smoke Test Vault
  url: https://example.com
YAML

cat << 'ABOUT' > "$VAULT_DIR/pages/about.md"
---
title: "About"
---
ABOUT

cat << 'MD' > "$VAULT_DIR/notes/smoke-test.md"
---
title: "Smoke Test Note"
date: "2026-08-24"
slug: "smoke-test"
---
Hello World from the smoke test!
MD

cd "$VAULT_DIR"
echo "==> Running daybook build in temporary vault"
"$DAYBOOK_BIN" build

echo "==> Asserting generated assets"
if [ ! -f "public/index.html" ]; then
    echo "ERROR: public/index.html is missing"
    exit 1
fi
if [ ! -f "public/vendor/waline/waline.js" ] || [ ! -f "public/vendor/waline/waline.css" ]; then
    echo "ERROR: Waline assets are missing"
    exit 1
fi
if [ ! -f "public/vendor/katex/katex.js" ] || [ ! -f "public/vendor/katex/katex.min.css" ]; then
    echo "ERROR: KaTeX assets are missing"
    exit 1
fi
if [ ! -d "public/vendor/fonts" ]; then
    echo "ERROR: Vendor fonts are missing"
    exit 1
fi

echo "==> Checking for source leaks in generated assets"
if grep -r "assets/ts/" public/js/ 2>/dev/null; then
    echo "ERROR: Found source path leak (assets/ts/) in generated JS"
    exit 1
fi
if find public/js -name "*.js.map" | grep -q .; then
    echo "ERROR: Found external .js.map in generated JS"
    exit 1
fi

echo "==> All checks passed successfully!"
