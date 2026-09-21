import { homedir } from 'node:os';
import { join } from 'node:path';
import { JsonStorage } from '@basmilius/apple-sdk';

/**
 * The credential store, with its writes serialized. `JsonStorage.save()` reads the whole file,
 * rewrites it and has no lock of its own, so two pairings finishing at once would lose one of them.
 */
export class StorageQueue {
    readonly #storage: JsonStorage;
    readonly #path: string;

    #pending: Promise<void> = Promise.resolve();

    constructor() {
        this.#path = join(homedir(), '.config', 'apple-protocols', 'storage.json');
        this.#storage = new JsonStorage();

        this.save = this.save.bind(this);
    }

    get storage(): JsonStorage {
        return this.#storage;
    }

    get path(): string {
        return this.#path;
    }

    async load(): Promise<void> {
        await this.#storage.load();
    }

    /** Resolves once this call's write is on disk, with earlier writes already done. */
    async save(): Promise<void> {
        this.#pending = this.#pending.then(
            () => this.#storage.save(),
            () => this.#storage.save()
        );

        await this.#pending;
    }
}
