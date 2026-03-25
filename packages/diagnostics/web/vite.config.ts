import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
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
