import type { DiscoveryResult } from '@basmilius/apple-common';
/**
 * RAOP Audio Session - manages connection to RAOP-enabled device
 */
export declare class RaopSession {
    private socket;
    private readonly targetHost;
    private readonly targetPort;
    readonly deviceInfo: DiscoveryResult;
    constructor(device: DiscoveryResult);
    establish(): Promise<void>;
    teardown(): Promise<void>;
    isActive(): boolean;
    getDeviceIdentifier(): string;
}
