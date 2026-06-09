import { composeLibrary, preset } from '@basmilius/vite-preset';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const flux = composeLibrary({
    name: '@flux-ui/components',
    alias: '$flux',
    isolated: true
});

export default defineConfig({
    plugins: [
        preset({
            cssModules: {
                classNames: 'kebab'
            }
        }),
        flux(),
        vue()
    ],
    build: {
        outDir: '../dist-web',
        emptyOutDir: true
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
            '/ws': {
                target: 'ws://localhost:3000',
                ws: true
            }
        }
    }
});
