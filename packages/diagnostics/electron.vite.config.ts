import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const packages = fileURLToPath(new URL('..', import.meta.url));

/*
 * The protocol packages are resolved to their sources rather than to their `dist`, the same way the
 * tsconfig path aliases do it in every other package here, so working on a protocol and working on
 * the app that inspects it never needs a rebuild in between.
 */
const protocolAliases = {
    '@basmilius/apple-airplay': `${packages}/airplay/src`,
    '@basmilius/apple-audio-source': `${packages}/audio-source/src`,
    '@basmilius/apple-common': `${packages}/common/src`,
    '@basmilius/apple-companion-link': `${packages}/companion-link/src`,
    '@basmilius/apple-encoding': `${packages}/encoding/src`,
    '@basmilius/apple-encryption': `${packages}/encryption/src`,
    '@basmilius/apple-raop': `${packages}/raop/src`,
    '@basmilius/apple-rtsp': `${packages}/rtsp/src`,
    '@basmilius/apple-sdk': `${packages}/sdk/src`
};

/* Electron and everything Node brings stay outside the bundle; the rest is inlined. */
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
                input: `${here}src/main/index.ts`,
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
