import { build, clean, copy, dts } from '@basmilius/tools';

const minify = !('NOMINIFY' in process.env);

await build({
    entrypoints: ['src/index.ts'],
    minify,
    sourcemap: 'none',
    plugins: [
        clean('dist'),
        copy('./src/types.ts', './dist/types.d.ts'),
        dts()
    ],
    external: [
        '@basmilius/apple-common',
        '@basmilius/apple-encoding',
        '@basmilius/apple-encryption'
    ]
});
