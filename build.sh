set -e

bun --cwd packages/core build

bun --cwd packages/airplay build
bun --cwd packages/companion-link build
bun --cwd packages/audio-source build

bun --cwd packages/devices build

# Into out-check/, so a check never rewrites out/ under a running diagnostics app.
bun --cwd packages/diagnostics build:check
