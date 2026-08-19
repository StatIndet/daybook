#!/usr/bin/env bash
set -euo pipefail



npm run typecheck
npm run build:js
go run ./cmd/daybook build
