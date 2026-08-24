#!/usr/bin/env bash
set -euo pipefail

echo "=> Building frontend assets..."
npm ci
npm run build:js
npm run build:vendor

# Determine installation path
if [ -n "${GOBIN:-}" ]; then
    INSTALL_BIN="$GOBIN"
else
    INSTALL_BIN="$(go env GOPATH)/bin"
fi

echo "=> Installing daybook CLI to $INSTALL_BIN..."
go install ./cmd/daybook

echo "=> Install successful."
echo "=> Executable is located at: $INSTALL_BIN/daybook"

# Check if INSTALL_BIN is in PATH
if [[ ":$PATH:" != *":$INSTALL_BIN:"* ]]; then
    echo ""
    echo "Warning: $INSTALL_BIN is not in your PATH."
    echo "You may need to add it to your shell configuration (e.g., ~/.bashrc, ~/.zshrc):"
    echo "  export PATH=\"\$PATH:$INSTALL_BIN\""
fi
