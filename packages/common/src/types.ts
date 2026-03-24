/** Possible states of a TCP connection managed by {@link Connection}. */
export type ConnectionState =
    | 'closing'
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'failed';

/** Generic event map type used as a constraint for typed EventEmitter subclasses. */
export type EventMap = Record<string, any>;

/** DNS record class identifiers as defined in RFC 1035. */
export type DnsRecordClass = 'IN' | 'CS' | 'CH' | 'HS' | 'ANY';

/** DNS record types relevant to mDNS service discovery. */
export type DnsRecordType =
    | 'A'
    | 'AAAA'
    | 'CNAME'
    | 'MX'
    | 'NS'
    | 'NSEC'
    | 'PTR'
    | 'SOA'
    | 'SRV'
    | 'TXT';

/** Base fields shared by all DNS resource records. */
export type DnsRecordBase = {
    readonly name: string;
    readonly type: DnsRecordType;
    readonly class: DnsRecordClass;
    readonly flash: boolean;
    readonly ttl: number;
};

/** DNS A record containing an IPv4 address. */
export type DnsRecordA = DnsRecordBase & {
    readonly type: 'A';
    readonly rdata: string;
};

/** DNS AAAA record containing an IPv6 address. */
export type DnsRecordAAAA = DnsRecordBase & {
    readonly type: 'AAAA';
    readonly rdata: string;
};

/** DNS PTR record containing a domain name pointer. */
export type DnsRecordPTR = DnsRecordBase & {
    readonly type: 'PTR';
    readonly rdata: string;
};

/** DNS TXT record containing key-value properties (used for mDNS service metadata). */
export type DnsRecordTXT = DnsRecordBase & {
    readonly type: 'TXT';
    readonly rdata: Record<string, string>;
    readonly rdata_buffer: Record<string, Buffer>;
};

/** DNS SRV record containing a service location (host, port, priority, weight). */
export type DnsRecordSRV = DnsRecordBase & {
    readonly type: 'SRV';
    readonly rdata: {
        readonly priority: number;
        readonly weight: number;
        readonly port: number;
        readonly target: string;
    };
};

/** DNS NSEC record containing next secure domain name. */
export type DnsRecordNSEC = DnsRecordBase & {
    readonly type: 'NSEC';
    readonly rdata: string;
};

/** Union of all supported DNS record types. */
export type DnsRecord =
    | DnsRecordA
    | DnsRecordAAAA
    | DnsRecordPTR
    | DnsRecordTXT
    | DnsRecordSRV
    | DnsRecordNSEC;

/** Parsed DNS packet header fields. */
export type DnsPacketHeader = {
    readonly id: number;
    readonly qr: number;
    readonly op: number;
    readonly aa: number;
    readonly tc: number;
    readonly rd: number;
    readonly ra: number;
    readonly z: number;
    readonly ad: number;
    readonly cd: number;
    readonly rc: number;
    readonly questions: number;
    readonly answers: number;
    readonly authorities: number;
    readonly additionals: number;
};

/** A complete parsed DNS packet with header and all record sections. */
export type DnsPacket = {
    readonly address: string;
    readonly header: DnsPacketHeader;
    readonly questions: DnsRecord[];
    readonly answers: DnsRecord[];
    readonly authorities: DnsRecord[];
    readonly additionals: DnsRecord[];
};

/** Base discovery result from an mDNS service query. */
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
    readonly packet: DnsPacket;
    readonly [key: string]: unknown;
};

/** Extended discovery result with device identifier, TXT record properties, and parsed feature flags. */
export type DiscoveryResult = {
    readonly id: string;
    readonly txt: Record<string, string>;
    readonly features?: bigint;
} & Result;

/**
 * Aggregated discovery result combining AirPlay, Companion Link, and RAOP
 * service information for a single physical device.
 */
export type CombinedDiscoveryResult = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    airplay?: DiscoveryResult;
    companionLink?: DiscoveryResult;
    raop?: DiscoveryResult;
};
