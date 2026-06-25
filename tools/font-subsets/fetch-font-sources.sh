#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/tools/font-subsets/source"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"

mkdir -p \
  "$SRC/allura" \
  "$SRC/fraunces" \
  "$SRC/zhi-mang-xing"

download() {
  local url="$1"
  local out="$2"

  echo "Downloading: $out"
  wget --quiet --show-progress --continue --output-document="$out" "$url"

  if [[ ! -s "$out" ]]; then
    echo "Downloaded file is empty: $out" >&2
    exit 1
  fi
}

download "$BASE/allura/Allura-Regular.ttf" \
  "$SRC/allura/Allura-Regular.ttf"

download "$BASE/allura/OFL.txt" \
  "$SRC/allura/OFL.txt"

download "$BASE/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf" \
  "$SRC/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf"

download "$BASE/fraunces/OFL.txt" \
  "$SRC/fraunces/OFL.txt"



download "$BASE/zhimangxing/ZhiMangXing-Regular.ttf" \
  "$SRC/zhi-mang-xing/ZhiMangXing-Regular.ttf"

download "$BASE/zhimangxing/OFL.txt" \
  "$SRC/zhi-mang-xing/OFL.txt"

echo "Done. Font sources downloaded to:"
echo "$SRC"
