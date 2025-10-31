import { build, dts } from '@basmilius/tools';

await build({
    entrypoints: ['src/index.ts'],
    plugins: [
        dts()
    ],
    external: [
        '@plist/binary.parse',
        '@plist/binary.serialize',
        'fast-srp-hap',
        'futoin-hkdf',
        'node-dns-sd',
        'tweetnacl',
        'uuid'
    ]
});
