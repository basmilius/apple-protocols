import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {index: './src/index.ts', 'decode-worker': './src/decoder/worker.ts'},
    logLevel: 'warn',
    minify: false
});
