import { Socket } from 'node:net';
import type { DiscoveryResult } from '@basmilius/apple-common';

/**
 * RAOP Audio Session - manages connection to RAOP-enabled device
 */
export class RaopSession {
  private socket: Socket | null = null;
  private readonly targetHost: string;
  private readonly targetPort: number;
  readonly deviceInfo: DiscoveryResult;

  constructor(device: DiscoveryResult) {
    this.deviceInfo = device;
    this.targetHost = device.address;
    this.targetPort = device.service.port;
  }

  async establish(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();
      
      const handleError = (error: Error) => {
        this.socket?.removeListener('connect', handleConnect);
        reject(error);
      };
      
      const handleConnect = () => {
        this.socket?.removeListener('error', handleError);
        resolve();
      };
      
      this.socket.once('error', handleError);
      this.socket.once('connect', handleConnect);
      
      this.socket.connect(this.targetPort, this.targetHost);
    });
  }

  async teardown(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (error) {
        // Socket may already be destroyed or in an invalid state
        console.warn('Error during socket teardown:', error);
      } finally {
        this.socket = null;
      }
    }
  }

  isActive(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  getDeviceIdentifier(): string {
    return this.deviceInfo.id;
  }
}
