import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';

/**
 * RAOP Device Finder - discovers RAOP-enabled devices on network
 */
export class RaopFinder {
  private discoveryService: Discovery;

  constructor() {
    this.discoveryService = Discovery.raop();
  }

  async locateDevices(): Promise<DiscoveryResult[]> {
    return await this.discoveryService.find();
  }

  async locateDevice(deviceId: string, attempts = 5, delayMs = 2000): Promise<DiscoveryResult> {
    return await this.discoveryService.findUntil(deviceId, attempts, delayMs);
  }
}
