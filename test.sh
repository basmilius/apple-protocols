#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Build workspace dependencies before running tests that import their public entry points.
for package in encoding encryption common audio-source rtsp airplay companion-link raop sdk; do
    bun --cwd "packages/$package" build
done

bun test ./packages/*/test/*.test.ts

# Homey runs Node; keep external dependencies resolved from each package's node_modules.
cleanup() { rm -rf packages/*/.test-build; }
trap cleanup EXIT
for directory in packages/*/test; do
    sources=("$directory"/*.test.ts)
    [[ -f "${sources[0]}" ]] || continue
    output="${directory%/test}/.test-build"
    bun build "${sources[@]}" --target node --packages external --outdir "$output" --entry-naming '[name].mjs'
    if [[ -d "$directory/fixtures" ]]; then cp -R "$directory/fixtures" "$output/fixtures"; fi
done
node --test packages/*/.test-build/*.test.mjs
