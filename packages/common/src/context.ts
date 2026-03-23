import { Logger } from './reporter';

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

export class Context {
    get deviceId(): string {
        return this.#deviceId;
    }

    get identity(): DeviceIdentity {
        return this.#identity;
    }

    get logger(): Logger {
        return this.#logger;
    }

    readonly #deviceId: string;
    readonly #identity: DeviceIdentity;
    readonly #logger: Logger;

    constructor(deviceId: string, identity?: Partial<DeviceIdentity>) {
        this.#deviceId = deviceId;
        this.#identity = { ...DEFAULT_IDENTITY, ...identity };
        this.#logger = new Logger(deviceId);
    }
}
