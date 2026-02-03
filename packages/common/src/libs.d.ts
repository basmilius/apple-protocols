declare module 'node-dns-sd' {
    import type { DiscoveryResult, DnsPacket, DnsRecord, Result } from './types';

    export function discover(opts: {
        readonly name: string;
    }): Promise<Result[]>;

    export type {
        DiscoveryResult,
        DnsPacket,
        DnsRecord,
        Result
    };
}
