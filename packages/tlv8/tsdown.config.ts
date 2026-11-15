import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {index: './src/index.ts'},
    logLevel: 'warn',
    minify: false
});
