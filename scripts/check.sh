#!/usr/bin/env bash
set -euo pipefail

echo "Running TypeScript checks..."
npm install
npm run typecheck

echo "Running reading rail tests..."
npm run test:reading-rail

echo "Running Go tests..."
go test ./...

echo "Verifying Go site build..."
npm run build:js
go run ./cmd/daybook build

echo "Verifying no leaked source paths in embedded JS..."
LEAKED=$(grep -r "assets/ts" internal/embedded/static/js | grep -v "\.map" | grep -v "// assets/ts" || true)
if [ -n "$LEAKED" ]; then
    echo "ERROR: Found leaked source tree paths in embedded JS!"
    echo "$LEAKED"
    exit 1
fi
echo "Embedded JS validation passed."
