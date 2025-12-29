import { exists, rm } from 'node:fs/promises';
import { build, copy, dts } from '@basmilius/tools';

if (await exists('./dist')) {
    await rm('./dist', {
        recursive: true
    });
}

const minify = !('NOMINIFY' in process.env);

await build({
    entrypoints: ['src/index.ts'],
    minify,
    sourcemap: 'none',
    plugins: [
        dts(),
        copy('./src/types.ts', './dist/types.d.ts')
    ],
    external: [
        '@basmilius/apple-common',
        '@basmilius/apple-encoding',
        '@bufbuild/protobuf'
    ]
});
