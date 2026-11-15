import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const packages = fileURLToPath(new URL('..', import.meta.url));

/* Resolve protocol packages to source, matching tsconfig aliases, so protocol edits need no separate build. A key also covers its subpaths. */
const protocolAliases = {
    '@corewire/airplay': `${packages}/airplay/src`,
    '@corewire/audio-source': `${packages}/audio-source/src`,
    '@corewire/companion-link': `${packages}/companion-link/src`,
    '@corewire/core': `${packages}/core/src`,
    '@corewire/devices': `${packages}/devices/src`,
    'opack': `${packages}/opack/src`,
    'tlv8': `${packages}/tlv8/src`
};

/* `DIAGNOSTICS_OUT_DIR` builds elsewhere than `out/`, so a check build never rewrites the files of a running app. */
const outDir = process.env.DIAGNOSTICS_OUT_DIR ? resolve(here, process.env.DIAGNOSTICS_OUT_DIR) : undefined;
const outDirOf = (scope: string): {outDir?: string} => outDir ? {outDir: `${outDir}/${scope}`} : {};

const external = ['electron', /^electron\/.+/, ...builtinModules, ...builtinModules.map(name => `node:${name}`)];

export default defineConfig({
    main: {
        resolve: {
            alias: {
                '@shared': `${here}src/shared`,
                ...protocolAliases
            }
        },
        build: {
            ...outDirOf('main'),
            rollupOptions: {
                external,
                input: {index: `${here}src/main/index.ts`, 'decode-worker': `${packages}/audio-source/src/decoder/worker.ts`},
                output: {
                    format: 'es',
                    entryFileNames: '[name].mjs'
                }
            }
        }
    },
    preload: {
        resolve: {
            alias: {
                '@shared': `${here}src/shared`
            }
        },
        build: {
            ...outDirOf('preload'),
            rollupOptions: {
                external,
                input: `${here}src/preload/index.ts`,
                /* Electron only loads an ESM preload when the file ends in `.mjs`. */
                output: {
                    format: 'es',
                    entryFileNames: '[name].mjs'
                }
            }
        }
    },
    renderer: {
        root: `${here}src/renderer`,
        resolve: {
            alias: {
                '@': `${here}src/renderer`,
                '@shared': `${here}src/shared`
            }
        },
        plugins: [react(), tailwindcss()],
        build: {
            ...outDirOf('renderer'),
            rollupOptions: {
                input: `${here}src/renderer/index.html`
            }
        }
    }
});
