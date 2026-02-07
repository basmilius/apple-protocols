import { build, clean, dts } from '@basmilius/tools';

const minify = !('NOMINIFY' in process.env);

await build({
    entrypoints: ['src/index.ts'],
    minify,
    sourcemap: 'none',
    plugins: [
        clean('dist'),
        dts()
    ],
    external: [
        '@basmilius/apple-airplay',
        '@basmilius/apple-common',
        '@basmilius/apple-companion-link',
        '@basmilius/apple-encoding',
        '@basmilius/apple-encryption'
    ]
});
