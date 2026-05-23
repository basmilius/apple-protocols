import { TimingServer } from '@basmilius/apple-common';
import type { NtpServerSnapshot } from '@shared/snapshots';

type Listener = (snapshot: NtpServerSnapshot) => void;

export class NtpServerService {
    #server: TimingServer | null = null;
    readonly #listeners = new Set<Listener>();

    get instance(): TimingServer | null {
        return this.#server;
    }

    snapshot(): NtpServerSnapshot {
        if (!this.#server) {
            return {running: false, port: null};
        }

        return {
            running: true,
            port: this.#server.port
        };
    }

    async start(): Promise<NtpServerSnapshot> {
        if (this.#server) {
            return this.snapshot();
        }

        const server = new TimingServer();
        await server.listen();
        this.#server = server;

        const snapshot = this.snapshot();
        this.#emit(snapshot);
        return snapshot;
    }

    stop(): NtpServerSnapshot {
        if (this.#server) {
            this.#server.close();
            this.#server = null;
        }

        const snapshot = this.snapshot();
        this.#emit(snapshot);
        return snapshot;
    }

    addListener(listener: Listener): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    #emit(snapshot: NtpServerSnapshot): void {
        for (const listener of this.#listeners) {
            listener(snapshot);
        }
    }
}
