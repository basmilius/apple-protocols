import { EventEmitter } from 'node:events';

type EventMap = {
    close: [];
    connect: [];
    error: [Error];
};

export default class BaseSocket<T extends Record<string, any>> extends EventEmitter<T | EventMap> {
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

    async onClose(): Promise<void> {
        this.emit('close');
    }

    async onConnect(): Promise<void> {
        this.emit('connect');
    }

    async onError(err: Error): Promise<void> {
        this.emit('error', err);
    }
}
