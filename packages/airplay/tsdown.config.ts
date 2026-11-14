import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: './src/index.ts',
        mrp: './src/mrp/index.ts',
        raop: './src/raop/index.ts',
        rtsp: './src/rtsp/index.ts'
    },
    logLevel: 'warn',
    minify: false
});
