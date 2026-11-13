/** Cursor buffer bounded by both entry count and serialized bytes. */
export class Ring<T> {
    readonly #capacity: number;
    readonly #cursorOf: (entry: T) => number;
    readonly #byteLimit: number;
    readonly #entries: T[] = [];
    readonly #sizes: number[] = [];
    #offset = 0;
    #bytes = 0;
    #dropped = 0;
    #head = 0;

    constructor(capacity: number, cursorOf: (entry: T) => number, byteLimit = 16 * 1024 * 1024) {
        this.#capacity = capacity;
        this.#cursorOf = cursorOf;
        this.#byteLimit = byteLimit;
    }

    get entries(): readonly T[] {
        return this.#entries.slice(this.#offset);
    }

    get head(): number {
        return this.#head;
    }

    get stats(): {entries: number; retainedBytes: number; byteLimit: number; dropped: number} {
        return {entries: this.#entries.length - this.#offset, retainedBytes: this.#bytes, byteLimit: this.#byteLimit, dropped: this.#dropped};
    }

    push(entry: T): void {
        const bytes = Buffer.byteLength(JSON.stringify(entry));
        this.#head = this.#cursorOf(entry);
        if (bytes > this.#byteLimit) {
            this.#dropped++;
            return;
        }
        this.#entries.push(entry);
        this.#sizes.push(bytes);
        this.#bytes += bytes;
        while (this.#entries.length - this.#offset > this.#capacity || this.#bytes > this.#byteLimit) {
            this.#bytes -= this.#sizes[this.#offset];
            this.#entries[this.#offset++] = undefined!;
            this.#dropped++;
        }
        if (this.#offset > 1024 && this.#offset > this.#entries.length / 2) {
            this.#entries.splice(0, this.#offset);
            this.#sizes.splice(0, this.#offset);
            this.#offset = 0;
        }
    }

    since(after: number): T[] {
        return this.entries.filter(entry => this.#cursorOf(entry) > after);
    }

    clear(): void {
        this.#entries.length = 0;
        this.#sizes.length = 0;
        this.#offset = 0;
        this.#bytes = 0;
    }
}
