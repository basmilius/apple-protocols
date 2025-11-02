export default class BaseSocket extends EventTarget {
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
