import { Logger, type LogSink } from '../reporter';

/** The name every protocol presents for this client when the identity has none. */
export const DEFAULT_CLIENT_NAME = 'Apple Protocols';

/**
 * Overrides of the identity this client presents to Apple devices during pairing and protocol
 * negotiation. Each protocol fills what is missing with its own defaults.
 */
export type DeviceIdentity = {
    /** The name the device shows for this client, such as in its list of paired devices; {@link DEFAULT_CLIENT_NAME} when omitted. */
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
 * Travels through every protocol layer of one device connection, so all layers log under the
 * same device id and present the same identity.
 */
export class Context {
    /** Identifies the target device, usually by its mDNS host name. */
    get deviceId(): string {
        return this.#deviceId;
    }

    /** The identity overrides this client presents; a protocol fills the rest with its defaults. */
    get identity(): DeviceIdentity {
        return this.#identity;
    }

    /** Prefixes its output with the device id. */
    get logger(): Logger {
        return this.#logger;
    }

    readonly #deviceId: string;
    readonly #identity: DeviceIdentity;
    readonly #logger: Logger;

    /**
     * @param sink - Also receives every log record of this context.
     */
    constructor(deviceId: string, identity: DeviceIdentity = {}, sink?: LogSink) {
        this.#deviceId = deviceId;
        this.#identity = {...identity};
        this.#logger = new Logger(deviceId, sink);
    }
}
