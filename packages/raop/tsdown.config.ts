import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['./src/index.ts'],
    minify: false,
    sourcemap: false
});
