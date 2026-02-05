import { Discovery } from '@basmilius/apple-common';
/**
 * RAOP Device Finder - discovers RAOP-enabled devices on network
 */
export class RaopFinder {
    discoveryService;
    constructor() {
        this.discoveryService = Discovery.raop();
    }
    async locateDevices() {
        return await this.discoveryService.find();
    }
    async locateDevice(deviceId, attempts = 5, delayMs = 2000) {
        return await this.discoveryService.findUntil(deviceId, attempts, delayMs);
    }
}
