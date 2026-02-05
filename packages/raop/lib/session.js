import { Socket } from 'node:net';
/**
 * RAOP Audio Session - manages connection to RAOP-enabled device
 */
export class RaopSession {
    socket = null;
    targetHost;
    targetPort;
    deviceInfo;
    constructor(device) {
        this.deviceInfo = device;
        this.targetHost = device.address;
        this.targetPort = device.service.port;
    }
    async establish() {
        return new Promise((resolve, reject) => {
            this.socket = new Socket();
            this.socket.on('error', reject);
            this.socket.on('connect', () => resolve());
            this.socket.connect(this.targetPort, this.targetHost);
        });
    }
    async teardown() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }
    isActive() {
        return this.socket !== null && !this.socket.destroyed;
    }
    getDeviceIdentifier() {
        return this.deviceInfo.id;
    }
}
