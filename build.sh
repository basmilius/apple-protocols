set -e

bun --cwd packages/core build

bun --cwd packages/airplay build
bun --cwd packages/companion-link build
bun --cwd packages/audio-source build

bun --cwd packages/devices build

bun --cwd packages/proxy check

bun --cwd packages/diagnostics build
