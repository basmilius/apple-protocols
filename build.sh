set -e

# Published without dependencies; their dist may import nothing but node:* builtins.
bun --cwd packages/opack build
bun --cwd packages/tlv8 build
bun tools/check-standalone.ts packages/opack packages/tlv8

bun --cwd packages/core build

bun --cwd packages/airplay build
bun --cwd packages/companion-link build
bun --cwd packages/audio-source build

bun --cwd packages/devices build

# Into out-check/, so a check never rewrites out/ under a running diagnostics app.
bun --cwd packages/diagnostics build:check
