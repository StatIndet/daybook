#!/usr/bin/env bash
# Exercise a clean Ubuntu build image with no browser libraries and no sudo.
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
go build -o "$test_dir/daybook" ./cmd/daybook
node_root=$(dirname "$(dirname "$(command -v node)")")
docker run --rm \
    -v "$test_dir/daybook:/usr/local/bin/daybook:ro" \
    -v "$node_root:/opt/node:ro" \
    -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -i ubuntu:24.04 bash -eu <<'CONTAINER'
apt-get update
apt-get install -y --no-install-recommends ca-certificates
useradd --create-home builder
su -s /bin/bash builder <<'BUILDER'
set -eu
export PATH=/opt/node/bin:$PATH
cd "$HOME"
test "$(id -u)" != 0
daybook setup-og --user-deps
mkdir -p vault/notes vault/pages
printf -- '---\ntitle: About\n---\n' > vault/pages/about.md
printf 'site:\n  url: https://example.com\n' > daybook.yaml
printf -- '---\ndate: 2026-10-05\n---\nRootless OG smoke test.\n' > vault/notes/rootless.md
daybook build
node <<'JS'
const fs = require('node:fs');
const dir = 'public/generated/og/notes';
const files = fs.readdirSync(dir);
if (files.length !== 1) throw Error('missing card');
const png = fs.readFileSync(dir + '/' + files[0]);
if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) throw Error('invalid PNG');
JS
BUILDER
CONTAINER
