#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

npm run typecheck
npm run build:js
npx concurrently "npm run watch:js" "go run ./cmd/daybook serve"
