#!/usr/bin/env bash
set -euo pipefail

echo "Building frontend assets..."
npm install
npm run build:js

echo "Building Go site..."
go run ./cmd/daybook build
