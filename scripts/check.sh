#!/usr/bin/env bash
set -euo pipefail

echo "==> Phase A: Dependency and Frontend Validation"
if [ -z "${CI:-}" ]; then npm ci; fi
npm run typecheck
npm run test:reading-rail
npm run build:js
npm run build:vendor

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
math: true
---
Hello World from the smoke test!

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
# Since minify is false for this run, it's expected to have // assets/ts/
# But wait, we shouldn't have .js.map
if find public/js -name "*.js.map" | grep -q .; then
    echo "ERROR: Found external .js.map in generated JS"
    exit 1
fi

echo "==> Starting Daybook dev server"
"$DAYBOOK_BIN" serve &
SERVER_PID=$!

max_attempts=20
attempt=1
ready=0
while [ $attempt -le $max_attempts ]; do
  sleep 0.2
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "ERROR: Daybook test server failed to start on port 1313."
    echo "Make sure port 1313 is available before running ./scripts/check.sh."
    exit 1
  fi
  
  if curl -s -f http://localhost:1313/ > /dev/null; then
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

echo "==> All checks passed successfully!"
