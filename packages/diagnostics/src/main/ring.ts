/**
 * A capped list read by cursor: a reader remembers the last cursor it saw and asks for what came
 * after it, which is what lets an agent mark a point in time, act, and read only what followed.
 */
export class Ring<T> {
    readonly #capacity: number;
    readonly #cursorOf: (entry: T) => number;
    readonly #entries: T[] = [];

    constructor(capacity: number, cursorOf: (entry: T) => number) {
        this.#capacity = capacity;
        this.#cursorOf = cursorOf;
    }

    get entries(): readonly T[] {
        return this.#entries;
    }

    /** The cursor of the newest entry, or 0 when there is none. */
    get head(): number {
        const last = this.#entries[this.#entries.length - 1];

        return last === undefined ? 0 : this.#cursorOf(last);
    }

    push(entry: T): void {
        this.#entries.push(entry);

        if (this.#entries.length > this.#capacity) {
            this.#entries.splice(0, this.#entries.length - this.#capacity);
        }
    }

    since(after: number): T[] {
        return this.#entries.filter(entry => this.#cursorOf(entry) > after);
    }

    clear(): void {
        this.#entries.length = 0;
    }
}
