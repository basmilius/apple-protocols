import { builtinModules } from 'node:module';
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
    '@corewire/devices': `${packages}/devices/src`
};

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
            rollupOptions: {
                input: `${here}src/renderer/index.html`
            }
        }
    }
});
