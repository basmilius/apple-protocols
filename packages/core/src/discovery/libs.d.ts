/** Type declarations for the node-dns-sd library (legacy mDNS dependency, no longer actively used). */
declare module 'node-dns-sd' {
    import type { DiscoveryResult, DnsPacket, DnsRecord, Result } from './types';

    /**
     * Discovers mDNS services matching the given name.
     *
     * @param opts - Discovery options with the service name to search for.
     * @returns An array of discovered service results.
     */
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
