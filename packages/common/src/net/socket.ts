import { EventEmitter } from 'node:events';

export default class BaseSocket<T extends Record<string, any>> extends EventEmitter<T> {
    get address(): string {
        return this.#address;
    }

    get port(): number {
        return this.#port;
    }

    readonly #address: string;
    readonly #port: number;

    constructor(address: string, port: number) {
        super();
        this.#address = address;
        this.#port = port;
    }

    async connect(): Promise<void> {
    }

    async disconnect(): Promise<void> {
    }
}
