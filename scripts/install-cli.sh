#!/usr/bin/env bash
set -e

echo "=> Building frontend assets..."
npm ci
npm run build:js
npm run build:vendor-fonts

echo "=> Installing daybook CLI to $(go env GOPATH)/bin..."
go install ./cmd/daybook

echo "=> Install successful."
