export default class BaseSocket {
    get address(): string {
        return this.#address;
    }

    get port(): number {
        return this.#port;
    }

    readonly #address: string;
    readonly #port: number;

    constructor(address: string, port: number) {
        this.#address = address;
        this.#port = port;
    }

    async connect(): Promise<void> {
    }
}
