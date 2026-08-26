#!/bin/sh
set -eu

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
case ":$PATH:" in
  *":$INSTALL_BIN:"*)
    ;;
  *)
    echo ""
    echo "Warning: $INSTALL_BIN is not in your PATH."
    echo "You may need to add it to your shell configuration (e.g., ~/.profile, ~/.zshrc):"
    echo "  export PATH=\"\$PATH:$INSTALL_BIN\""
    ;;
esac
