import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['./src/index.ts'],
    logLevel: 'warn',
    minify: false
});
