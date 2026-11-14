import { Logger, type LogSink } from '../reporter';

/**
 * Overrides of the identity this client presents to Apple devices during pairing and protocol
 * negotiation. Each protocol fills what is missing with its own defaults.
 */
export type DeviceIdentity = {
    /** The name the device shows for this client, such as in its list of paired devices. */
    readonly name?: string;
    readonly model?: string;
    readonly osName?: string;
    readonly osVersion?: string;
    readonly osBuildVersion?: string;
    readonly sourceVersion?: string;
    readonly applicationBundleIdentifier?: string;
    readonly applicationBundleVersion?: string;
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

    /** The identity overrides this client presents; a protocol fills the rest with its defaults. */
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
     * @param identity - Overrides of the identity this client presents.
     * @param sink - Also receives every log record of this context.
     */
    constructor(deviceId: string, identity: DeviceIdentity = {}, sink?: LogSink) {
        this.#deviceId = deviceId;
        this.#identity = {...identity};
        this.#logger = new Logger(deviceId, sink);
    }
}
