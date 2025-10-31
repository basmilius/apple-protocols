declare module 'chacha' {
    declare class Cipher {
        setAAD(aad: Buffer): void;
        getAuthTag(): Buffer;
        setAuthTag(tag: Buffer): void;
        _final(): void;
        _update(chunk: Buffer): Buffer;
    }

    export function createCipher(key: Buffer, nonce: Buffer): Cipher;

    export function createDecipher(key: Buffer, nonce: Buffer): Cipher;
}

declare module 'node-dns-sd' {
    export function discover(opts: {
        readonly name: string;
    }): Promise<Result[]>;

    export type Result = {
        readonly fqdn: string;
        readonly address: string;
        readonly modelName: string;
        readonly familyName: string | null;
        readonly service: {
            readonly port: number;
            readonly protocol: 'tcp' | 'udp';
            readonly type: string;
        };
        readonly packet: {
            readonly address: string;
            readonly header: Record<string, number>;
            readonly questions: Array;
            readonly answers: Array;
            readonly authorities: Array;
            readonly additionals: [];
        };
        readonly [key: string]: unknown;
    };
}
