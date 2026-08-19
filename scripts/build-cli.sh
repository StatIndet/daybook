#!/usr/bin/env bash
set -e

echo "=> Building frontend assets..."
npm ci
npm run build:js
npm run build:vendor-fonts

echo "=> Building daybook CLI..."
go build -o daybook ./cmd/daybook

echo "=> Build successful."
