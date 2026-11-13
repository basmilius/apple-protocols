import type { AudioSource } from './audioSource';

/** Owns one use of a source. Stop settles readers even when a custom source cannot cancel its read. */
export class AudioSourceSession implements AudioSource {
    readonly #source: AudioSource;
    readonly #readers = new Set<(value: Buffer | null) => void>();
    #starting?: Promise<void>;
    #stopping?: Promise<void>;
    #stopped = false;

    constructor(source: AudioSource) {
        this.#source = source;
    }

    get duration(): number {
        return this.#source.duration;
    }

    get stopped(): boolean {
        return this.#stopped;
    }

    start(): Promise<void> {
        if (this.#stopped) {
            return Promise.resolve();
        }
        return this.#starting ??= Promise.resolve().then(() => this.#stopped ? undefined : this.#source.start());
    }

    async readFrames(count: number): Promise<Buffer | null> {
        if (this.#stopped) {
            return null;
        }
        return new Promise((resolve, reject) => {
            const done = (value: Buffer | null): void => {this.#readers.delete(done); resolve(this.#stopped ? null : value);};
            this.#readers.add(done);
            void Promise.resolve().then(() => this.#stopped ? null : this.#source.readFrames(count)).then(done, error => {this.#readers.delete(done); reject(error);});
        });
    }

    stop(): Promise<void> {
        this.#stopped = true;
        for (const reader of this.#readers) {
            reader(null);
        }
        return this.#stopping ??= Promise.resolve(this.#starting).catch(() => {}).then(() => this.#source.stop());
    }

    async reset(): Promise<void> {
        throw new Error('Create a new audio session after resetting the source.');
    }
}
