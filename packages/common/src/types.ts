export type ConnectionState =
    | 'closing'
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'failed';

export type EventMap = Record<string, any>;

export type DnsRecordClass = 'IN' | 'CS' | 'CH' | 'HS' | 'ANY';

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

export type DnsRecordBase = {
    readonly name: string;
    readonly type: DnsRecordType;
    readonly class: DnsRecordClass;
    readonly flash: boolean;
    readonly ttl: number;
};

export type DnsRecordA = DnsRecordBase & {
    readonly type: 'A';
    readonly rdata: string;
};

export type DnsRecordAAAA = DnsRecordBase & {
    readonly type: 'AAAA';
    readonly rdata: string;
};

export type DnsRecordPTR = DnsRecordBase & {
    readonly type: 'PTR';
    readonly rdata: string;
};

export type DnsRecordTXT = DnsRecordBase & {
    readonly type: 'TXT';
    readonly rdata: Record<string, string>;
    readonly rdata_buffer: Record<string, Buffer>;
};

export type DnsRecordSRV = DnsRecordBase & {
    readonly type: 'SRV';
    readonly rdata: {
        readonly priority: number;
        readonly weight: number;
        readonly port: number;
        readonly target: string;
    };
};

export type DnsRecordNSEC = DnsRecordBase & {
    readonly type: 'NSEC';
    readonly rdata: string;
};

export type DnsRecord =
    | DnsRecordA
    | DnsRecordAAAA
    | DnsRecordPTR
    | DnsRecordTXT
    | DnsRecordSRV
    | DnsRecordNSEC;

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

export type DnsPacket = {
    readonly address: string;
    readonly header: DnsPacketHeader;
    readonly questions: DnsRecord[];
    readonly answers: DnsRecord[];
    readonly authorities: DnsRecord[];
    readonly additionals: DnsRecord[];
};

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

export type DiscoveryResult = {
    readonly id: string;
    readonly txt: Record<string, string>;
    readonly features?: bigint;
} & Result;

export type CombinedDiscoveryResult = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    airplay?: DiscoveryResult;
    companionLink?: DiscoveryResult;
    raop?: DiscoveryResult;
};
