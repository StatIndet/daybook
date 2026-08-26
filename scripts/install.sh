#!/bin/sh
set -eu

# GitHub repository
REPO="StatIndet/daybook"
DOWNLOAD_URL_BASE="https://github.com/${REPO}/releases"

# Default install directory
DAYBOOK_INSTALL_DIR="${DAYBOOK_INSTALL_DIR:-${HOME}/.local/bin}"

# Helpers
abort() {
  echo "ERROR: $1" >&2
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
  FreeBSD)
    OS_NAME="freebsd"
    ;;
  OpenBSD)
    OS_NAME="openbsd"
    ;;
  NetBSD)
    OS_NAME="netbsd"
    ;;
  DragonFly)
    OS_NAME="dragonfly"
    ;;
  *)
    abort "Unsupported operating system: $OS. Detected platform: $OS/$ARCH"
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
    abort "Unsupported architecture: $ARCH. Detected platform: $OS/$ARCH"
    ;;
esac

PLATFORM="${OS_NAME}_${ARCH_NAME}"
echo "=> Detected platform: $PLATFORM"

# 2. Check dependencies
if command -v curl >/dev/null 2>&1; then
  DOWNLOAD_CMD="curl -fsSL"
elif command -v wget >/dev/null 2>&1; then
  DOWNLOAD_CMD="wget -qO-"
elif command -v fetch >/dev/null 2>&1; then
  DOWNLOAD_CMD="fetch -q -o -"
else
  abort "Neither curl, wget, nor fetch is available. Please install one of them to download Daybook."
fi

compute_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256 >/dev/null 2>&1; then
    sha256 -q "$1"
  else
    abort "Neither sha256sum, shasum, nor sha256 is available. Please install one of them for checksum verification."
  fi
}

# verify tar exists
if ! command -v tar >/dev/null 2>&1; then
  abort "tar is not available."
fi

# 3. Get latest release tag
echo "=> Fetching latest release info..."
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
# Extract tag_name using standard text tools
LATEST_TAG=$($DOWNLOAD_CMD "$API_URL" | grep '"tag_name":' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/') || true

if [ -z "$LATEST_TAG" ]; then
  abort "Failed to determine the latest release tag from GitHub API."
fi

echo "=> Latest release is $LATEST_TAG"

# 4. Construct file names
ASSET_NAME="daybook_${LATEST_TAG}_${PLATFORM}.tar.gz"
ASSET_URL="${DOWNLOAD_URL_BASE}/download/${LATEST_TAG}/${ASSET_NAME}"
CHECKSUMS_URL="${DOWNLOAD_URL_BASE}/download/${LATEST_TAG}/checksums.txt"

# 5. Create temp dir and download
# Some environments (e.g. OpenBSD) might not have mktemp -d or behave differently, but generally mktemp -d is available.
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
ACTUAL_HASH=$(compute_sha256 "$ASSET_NAME")

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
case ":$PATH:" in
  *":$DAYBOOK_INSTALL_DIR:"*)
    ;;
  *)
    echo ""
    echo "Daybook was installed successfully, but $DAYBOOK_INSTALL_DIR is not in your PATH."
    echo "Add it to your shell PATH before using \`daybook\`:"
    echo ""
    echo "  export PATH=\"\$PATH:$DAYBOOK_INSTALL_DIR\""
    echo ""
    ;;
esac

