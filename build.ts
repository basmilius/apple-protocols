import { build, dts } from '@basmilius/tools';

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
    ]
});
