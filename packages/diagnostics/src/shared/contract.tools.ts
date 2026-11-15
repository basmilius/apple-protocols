import type { CallResult } from './contract';

export type ToolCategory = 'encoding' | 'encryption' | 'features';

export type ToolInputType = 'text' | 'textarea' | 'number' | 'boolean' | 'select';

export type ToolInputOption = {
    readonly value: string;
    readonly label: string;
};

/** One field of the form the renderer builds for a tool; `tool:run` gets these back by name. */
export type ToolInput = {
    readonly name: string;
    readonly label: string;
    readonly type: ToolInputType;
    readonly placeholder?: string;
    readonly default?: string | number | boolean;

    /** Only for `select`. */
    readonly options?: readonly ToolInputOption[];

    readonly hint?: string;
    readonly optional?: boolean;

    /** Rows for a `textarea`. */
    readonly rows?: number;
};

export type ToolInfo = {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly category: ToolCategory;

    /** A heading inside the category, such as `OPack` or `ChaCha20-Poly1305`. */
    readonly section: string;

    readonly inputs: readonly ToolInput[];
};

export type ToolRunRequest = {
    readonly toolId: string;
    readonly deviceId: string | null;
    readonly args: Readonly<Record<string, unknown>>;
};

/** What a round-trip tool answers with. `offset` is -1 when the two buffers are equal. */
export type RoundTripResult = {
    readonly ok: boolean;
    readonly inputLength: number;
    readonly outputLength: number;
    readonly offset: number;
    readonly expected: string | null;
    readonly actual: string | null;
    readonly input: string;
    readonly output: string;
};

export type StorageProtocol = 'airplay' | 'companionLink' | 'raop';

export type StoredDeviceInfo = {
    readonly identifier: string;
    readonly name: string;
    readonly credentials: readonly StorageProtocol[];
};

export type StorageDump = {
    readonly path: string;
    readonly revealed: boolean;
    readonly data: unknown;
};

export type MdnsMode = 'multicast' | 'unicast';

export type MdnsQuery = {
    readonly mode: MdnsMode;
    readonly services: readonly string[];

    /** Addresses to query directly; only read for a unicast scan. */
    readonly hosts?: readonly string[];

    readonly timeoutMs?: number;
};

/** The features TXT value of a record, decoded. Null on a record that carries none. */
export type MdnsFeatures = {
    readonly raw: string;

    /** The 64-bit mask as hex, since it does not fit a number. */
    readonly mask: string;

    readonly flags: readonly string[];
};

export type MdnsRecord = {
    readonly id: string;
    readonly name: string;
    readonly service: string;
    readonly fqdn: string;
    readonly address: string;
    readonly port: number;
    readonly txt: Readonly<Record<string, string>>;
    readonly features: MdnsFeatures | null;
    readonly model: string;
    readonly modelName: string;
    readonly pairing: string;
    readonly protocolVersion: 1 | 2;
    readonly passwordRequired: boolean;
    readonly remoteControl: boolean;
};

export type MdnsCombinedRecord = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly airplay: MdnsRecord | null;
    readonly companionLink: MdnsRecord | null;
    readonly raop: MdnsRecord | null;
};

export type DiscoveryService = 'airplay' | 'companionLink' | 'raop';

export type ProxyProtocol = 'airplay' | 'companionLink';

export type ProxyDirection = 'controller->device' | 'device->controller';

export type ProxyStartRequest = {
    readonly protocol: ProxyProtocol;

    /** The device in the last discovery result the proxy relays to. Its credentials must be stored. */
    readonly deviceId: string;

    /** 7000 for AirPlay and 49152 for Companion Link when omitted. */
    readonly port?: number;

    /** Appends every relayed message to a JSONL file under `~/.config/apple-protocols/proxy-captures`. */
    readonly capture?: boolean;
};

/** A running proxy. Its traffic goes into the traffic buffer as protocol `proxy`, under the device id. */
export type ProxyStatus = {
    readonly protocol: ProxyProtocol;
    readonly deviceId: string;
    readonly target: {
        readonly name: string;
        readonly address: string;
        readonly port: number;
    };

    /** The name controllers see. */
    readonly instanceName: string;

    readonly port: number;

    /** What a controller enters to pair with the proxy. */
    readonly pin: string;

    readonly startedAt: number;
    readonly capturePath: string | null;
    readonly messages: Readonly<Record<ProxyDirection, number>>;
};

export type ToolsInvokeMap = {
    'tool:list': [void, readonly ToolInfo[]];
    'tool:run': [ToolRunRequest, CallResult];

    'storage:devices': [void, readonly StoredDeviceInfo[]];
    'storage:read': [{ readonly reveal?: boolean }, StorageDump];
    'storage:removeCredentials': [{ readonly deviceId: string; readonly protocol: StorageProtocol }, void];
    'storage:removeDevice': [{ readonly deviceId: string }, void];

    'mdns:scan': [MdnsQuery, readonly MdnsRecord[]];
    'mdns:wake': [{ readonly address: string }, void];

    'discoverytools:findByAddress': [{ readonly service: DiscoveryService; readonly address: string; readonly timeoutMs?: number }, MdnsRecord | null];
    'discoverytools:findUntil': [{ readonly service: DiscoveryService; readonly id: string; readonly tries?: number; readonly timeoutMs?: number }, MdnsRecord];
    'discoverytools:discoverAll': [void, readonly MdnsCombinedRecord[]];
    'discoverytools:clearCache': [void, void];

    'proxy:start': [ProxyStartRequest, ProxyStatus];
    'proxy:stop': [{ readonly protocol: ProxyProtocol }, void];
    'proxy:status': [void, readonly ProxyStatus[]];
};

export type ToolsEventMap = {
    'proxy:status': readonly ProxyStatus[];
};

export const TOOLS_INVOKE_CHANNELS: readonly (keyof ToolsInvokeMap)[] = [
    'tool:list',
    'tool:run',
    'storage:devices',
    'storage:read',
    'storage:removeCredentials',
    'storage:removeDevice',
    'mdns:scan',
    'mdns:wake',
    'discoverytools:findByAddress',
    'discoverytools:findUntil',
    'discoverytools:discoverAll',
    'discoverytools:clearCache',
    'proxy:start',
    'proxy:stop',
    'proxy:status'
];

export const TOOLS_EVENT_CHANNELS: readonly (keyof ToolsEventMap)[] = ['proxy:status'];

export const PROXY_PROTOCOLS: readonly ProxyProtocol[] = ['airplay', 'companionLink'];

export const STORAGE_PROTOCOLS: readonly StorageProtocol[] = ['airplay', 'companionLink', 'raop'];
