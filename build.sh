set -e

bun --cwd packages/encoding build
bun --cwd packages/encryption build

bun --cwd packages/common build
bun --cwd packages/audio-source build

bun --cwd packages/airplay build
bun --cwd packages/companion-link build
bun --cwd packages/raop build

bun --cwd packages/devices build
