import { exists, rm } from 'node:fs/promises';
import { build, dts } from '@basmilius/tools';

if (await exists('./dist')) {
    await rm('./dist', {
        recursive: true
    });
}

await build({
    entrypoints: ['src/index.ts'],
    plugins: [
        dts()
    ],
    external: [
        '@noble/curves',
        '@plist/binary.parse',
        '@plist/binary.serialize',
        'chacha',
        'fast-srp-hap',
        'node-dns-sd',
        'tweetnacl',
        'uuid'
    ],
    drop: [
        'console.debug'
    ]
});
