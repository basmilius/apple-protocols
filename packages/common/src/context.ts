import { Logger } from './reporter';

/**
 * Describes the identity that this client presents to Apple devices during pairing
 * and protocol negotiation. Mimics a real Apple device to ensure compatibility.
 */
export type DeviceIdentity = {
    name: string;
    model: string;
    osName: string;
    osVersion: string;
    osBuildVersion: string;
    sourceVersion: string;
    applicationBundleIdentifier: string;
    applicationBundleVersion: string;
};

/** Default identity mimicking an iPhone running the Apple TV Remote app. */
const DEFAULT_IDENTITY: DeviceIdentity = {
    name: 'apple-protocols',
    model: 'iPhone17,3',
    osName: 'iPhone OS',
    osVersion: '26.3',
    osBuildVersion: '25D63',
    sourceVersion: '935.7.1',
    applicationBundleIdentifier: 'com.apple.TVRemote',
    applicationBundleVersion: '700'
};

/**
 * Shared context for a device connection, carrying the device identifier,
 * the client identity presented to the accessory, and a scoped logger.
 * Passed through the entire protocol stack for consistent identification and logging.
 */
export class Context {
    /** Unique identifier of the target device (typically its mDNS hostname). */
    get deviceId(): string {
        return this.#deviceId;
    }

    /** The identity this client presents to the Apple device. */
    get identity(): DeviceIdentity {
        return this.#identity;
    }

    /** Scoped logger instance tagged with the device identifier. */
    get logger(): Logger {
        return this.#logger;
    }

    readonly #deviceId: string;
    readonly #identity: DeviceIdentity;
    readonly #logger: Logger;

    /**
     * @param deviceId - Unique identifier of the target device.
     * @param identity - Optional partial override of the default device identity.
     */
    constructor(deviceId: string, identity?: Partial<DeviceIdentity>) {
        this.#deviceId = deviceId;
        this.#identity = { ...DEFAULT_IDENTITY, ...identity };
        this.#logger = new Logger(deviceId);
    }
}
