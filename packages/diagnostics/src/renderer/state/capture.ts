/** Shared capture limits include payload size, so artwork cannot dominate renderer memory. */
export class Capture<T extends object> {
    readonly #capacity: number;
    readonly #limit = 8 * 1024 * 1024;
    readonly #items: T[] = [];
    readonly #sizes: number[] = [];
    #bytes = 0;
    #offset = 0;

    constructor(capacity: number) {this.#capacity = capacity;}

    push(item: T): void {
        const size = new TextEncoder().encode(JSON.stringify(item)).length;
        if (size > this.#limit) return;
        this.#items.push(item);
        this.#sizes.push(size);
        this.#bytes += size;
        while (this.#items.length - this.#offset > this.#capacity || this.#bytes > this.#limit) {
            this.#bytes -= this.#sizes[this.#offset];
            this.#items[this.#offset++] = undefined!;
        }
        if (this.#offset > 1024 && this.#offset > this.#items.length / 2) {
            this.#items.splice(0, this.#offset);
            this.#sizes.splice(0, this.#offset);
            this.#offset = 0;
        }
    }

    snapshot(): readonly T[] {return this.#items.slice(this.#offset);}
    clear(): void {this.#items.length = this.#sizes.length = this.#offset = this.#bytes = 0;}
}
