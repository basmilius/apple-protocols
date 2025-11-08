import { exists, rm } from 'node:fs/promises';
import { build, dts } from '@basmilius/tools';

if (await exists('./dist')) {
    await rm('./dist', {
        recursive: true
    });
}

await build({
    entrypoints: ['src/index.ts', 'src/test.ts'],
    plugins: [
        dts()
    ],
    external: [
        '@basmilius/apple-airplay',
        '@basmilius/apple-common',
        '@basmilius/apple-companion-link'
    ]
});
