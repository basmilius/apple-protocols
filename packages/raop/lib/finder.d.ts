import { type DiscoveryResult } from '@basmilius/apple-common';
/**
 * RAOP Device Finder - discovers RAOP-enabled devices on network
 */
export declare class RaopFinder {
    private discoveryService;
    constructor();
    locateDevices(): Promise<DiscoveryResult[]>;
    locateDevice(deviceId: string, attempts?: number, delayMs?: number): Promise<DiscoveryResult>;
}
