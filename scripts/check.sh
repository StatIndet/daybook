#!/usr/bin/env bash
set -euo pipefail

echo "Running TypeScript checks..."
npm install
npm run typecheck

echo "Running Go tests..."
go test ./...

echo "Verifying Go site build..."
npm run build:js
go run ./cmd/daybook build
