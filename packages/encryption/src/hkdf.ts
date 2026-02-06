import { hkdfSync } from 'node:crypto';

export default function (options: HKDFOptions): Buffer {
    return Buffer.from(hkdfSync(options.hash, options.key, options.salt, options.info, options.length));
}

export type HKDFOptions = {
    readonly hash: string;
    readonly key: Buffer;
    readonly length: number;
    readonly salt: Buffer;
    readonly info: Buffer;
};
