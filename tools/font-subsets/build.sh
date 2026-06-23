#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/static/fonts"
GLYPHS="$ROOT/tools/font-subsets/glyphs"
OUT="$ROOT/static/vendor/fonts/decorative"

mkdir -p "$OUT"

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
}

subset_font() {
  local input="$1"
  local text_file="$2"
  local output="$3"

  require_file "$input"
  require_file "$text_file"

  echo "Generating: $output"

  fonttools subset "$input" \
    --text-file="$text_file" \
    --layout-features='*' \
    --flavor=woff2 \
    --output-file="$output"
}

subset_font \
  "$SRC/allura/Allura-Regular.ttf" \
  "$GLYPHS/allura.txt" \
  "$OUT/allura-subset.woff2"

subset_font \
  "$SRC/fraunces/Fraunces-Italic-VariableFont_SOFT,WONK,opsz,wght.ttf" \
  "$GLYPHS/fraunces.txt" \
  "$OUT/fraunces-subset.woff2"

subset_font \
  "$SRC/playfair_display/PlayfairDisplay-Italic-VariableFont_wght.ttf" \
  "$GLYPHS/playfair-display.txt" \
  "$OUT/playfair-display-subset.woff2"

subset_font \
  "$SRC/ZhiMangXing/ZhiMangXing-Regular.ttf" \
  "$GLYPHS/zhi-mang-xing.txt" \
  "$OUT/zhi-mang-xing-subset.woff2"

echo "Done. Decorative font subsets generated in:"
echo "$OUT"
