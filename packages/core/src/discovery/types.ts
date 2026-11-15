/** One service instance that an mDNS scan found. */
export type DiscoveryResult = {
    /** The mDNS host name, e.g. `Woonkamer-TV.local`. */
    readonly id: string;
    readonly fqdn: string;
    readonly address: string;
    readonly txt: Readonly<Record<string, string>>;
    readonly service: {
        readonly port: number;
        readonly protocol: 'tcp' | 'udp';
        readonly type: string;
    };
};

export type DiscoverOptions = {
    /** Reuse a scan that is less than 30 seconds old. Default: true. */
    readonly useCache?: boolean;
};
