#!/usr/bin/env bash
set -euo pipefail

# GitHub repository
REPO="StatIndet/daybook"
DOWNLOAD_URL_BASE="https://github.com/${REPO}/releases"

# Default install directory
DAYBOOK_INSTALL_DIR="${DAYBOOK_INSTALL_DIR:-${HOME}/.local/bin}"

# Helpers
abort() {
  echo "ERROR: $*" >&2
  exit 1
}

# 1. Detect OS & Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    OS_NAME="linux"
    ;;
  Darwin)
    OS_NAME="darwin"
    ;;
  *)
    abort "Unsupported platform: $OS/$ARCH"
    ;;
esac

case "$ARCH" in
  x86_64 | amd64)
    ARCH_NAME="amd64"
    ;;
  aarch64 | arm64)
    ARCH_NAME="arm64"
    ;;
  *)
    abort "Unsupported platform: $OS/$ARCH"
    ;;
esac

PLATFORM="${OS_NAME}_${ARCH_NAME}"
echo "=> Detected platform: $PLATFORM"

# 2. Check dependencies
if command -v curl >/dev/null 2>&1; then
  DOWNLOAD_CMD="curl -fsSL"
elif command -v wget >/dev/null 2>&1; then
  DOWNLOAD_CMD="wget -qO-"
else
  abort "Neither curl nor wget is available. Please install one of them to download Daybook."
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHASUM_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHASUM_CMD="shasum -a 256"
else
  abort "Neither sha256sum nor shasum is available. Please install one of them for checksum verification."
fi

if ! command -v tar >/dev/null 2>&1; then
  abort "tar is not available."
fi

# 3. Get latest release tag
echo "=> Fetching latest release info..."
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
# Extract tag_name using standard text tools
LATEST_TAG=$($DOWNLOAD_CMD "$API_URL" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  abort "Failed to determine the latest release tag from GitHub API."
fi

echo "=> Latest release is $LATEST_TAG"

# 4. Construct file names
ASSET_NAME="daybook_${LATEST_TAG}_${PLATFORM}.tar.gz"
ASSET_URL="${DOWNLOAD_URL_BASE}/download/${LATEST_TAG}/${ASSET_NAME}"
CHECKSUMS_URL="${DOWNLOAD_URL_BASE}/download/${LATEST_TAG}/checksums.txt"

# 5. Create temp dir and download
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

echo "=> Downloading $ASSET_NAME..."
$DOWNLOAD_CMD "$ASSET_URL" > "$TMP_DIR/$ASSET_NAME" || abort "Failed to download $ASSET_URL"

echo "=> Downloading checksums.txt..."
$DOWNLOAD_CMD "$CHECKSUMS_URL" > "$TMP_DIR/checksums.txt" || abort "Failed to download checksums.txt"

# 6. Verify checksum
echo "=> Verifying checksum..."
cd "$TMP_DIR"

if ! grep -q "$ASSET_NAME" checksums.txt; then
  abort "$ASSET_NAME not found in checksums.txt"
fi

EXPECTED_HASH=$(grep "$ASSET_NAME" checksums.txt | awk '{print $1}')
ACTUAL_HASH=$($SHASUM_CMD "$ASSET_NAME" | awk '{print $1}')

if [ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]; then
  abort "Checksum verification failed! Expected: $EXPECTED_HASH, Actual: $ACTUAL_HASH"
fi
echo "=> Checksum verified successfully."

# 7. Extract
echo "=> Extracting archive..."
tar -xzf "$ASSET_NAME" daybook || abort "Failed to extract tar.gz"

if [ ! -f "daybook" ]; then
  abort "Extracted archive did not contain 'daybook' binary."
fi

chmod +x daybook

# 8. Install
echo "=> Installing daybook to $DAYBOOK_INSTALL_DIR..."
mkdir -p "$DAYBOOK_INSTALL_DIR" || abort "Failed to create directory: $DAYBOOK_INSTALL_DIR"
cp daybook "$DAYBOOK_INSTALL_DIR/daybook" || abort "Failed to copy daybook to $DAYBOOK_INSTALL_DIR. Check permissions."

# 9. Verify installation
echo "=> Verifying installation..."
"$DAYBOOK_INSTALL_DIR/daybook" --version || abort "Failed to execute daybook after installation."

echo ""
echo "Daybook $LATEST_TAG installed successfully."
echo "Installed to: $DAYBOOK_INSTALL_DIR/daybook"

# 10. PATH Check
if [[ ":$PATH:" != *":$DAYBOOK_INSTALL_DIR:"* ]]; then
  echo ""
  echo "Daybook was installed successfully, but $DAYBOOK_INSTALL_DIR is not in your PATH."
  echo "Add it to your shell PATH before using \`daybook\`:"
  echo ""
  echo "  export PATH=\"\$PATH:$DAYBOOK_INSTALL_DIR\""
  echo ""
fi
