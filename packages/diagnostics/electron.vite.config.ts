import { flux, fluxApplication, preset } from '@basmilius/vite-preset';
import vue from '@vitejs/plugin-vue';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'out/main',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts')
                }
            }
        },
        resolve: {
            alias: {
                '@main': resolve(__dirname, 'src/main'),
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'out/preload',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts')
                }
            }
        },
        resolve: {
            alias: {
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'src/renderer'),
        plugins: [
            preset({
                cssModules: {
                    classNames: 'kebab'
                }
            }),
            flux(),
            fluxApplication(),
            vue()
        ],
        build: {
            outDir: 'out/renderer',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html')
                }
            }
        },
        resolve: {
            alias: {
                '@renderer': resolve(__dirname, 'src/renderer'),
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    }
});
