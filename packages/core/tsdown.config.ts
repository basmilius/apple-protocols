import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: './src/index.ts',
        crypto: './src/crypto/index.ts',
        discovery: './src/discovery/index.ts',
        encoding: './src/encoding/index.ts',
        pairing: './src/pairing/index.ts',
        storage: './src/storage.ts',
        transport: './src/transport/index.ts'
    },
    logLevel: 'warn',
    minify: false
});
