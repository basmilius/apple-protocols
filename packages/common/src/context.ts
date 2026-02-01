import { Logger } from './reporter';

export class Context {
    get deviceId(): string {
        return this.#deviceId;
    }

    get logger(): Logger {
        return this.#logger;
    }

    readonly #deviceId: string;
    readonly #logger: Logger;

    constructor(deviceId: string) {
        this.#deviceId = deviceId;
        this.#logger = new Logger(deviceId);
    }
}
