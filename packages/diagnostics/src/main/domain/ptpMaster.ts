import { PtpMaster } from '@basmilius/apple-common';
import type { PtpMasterSnapshot } from '@shared/snapshots';

type Listener = (snapshot: PtpMasterSnapshot) => void;

const POLL_INTERVAL_MS = 500;

export class PtpMasterService {
    #master: PtpMaster | null = null;
    #peerAddress: string | null = null;
    #pollTimer: NodeJS.Timeout | null = null;
    readonly #listeners = new Set<Listener>();

    get instance(): PtpMaster | null {
        return this.#master;
    }

    get peerAddress(): string | null {
        return this.#peerAddress;
    }

    snapshot(): PtpMasterSnapshot {
        if (!this.#master) {
            return {
                running: false,
                peerAddress: this.#peerAddress,
                clockIdentity: null,
                eventPort: null,
                generalPort: null,
                state: null,
                syncsSent: 0,
                announcesSent: 0,
                delayReqsReceived: 0,
                delayRespsSent: 0,
                announcesReceived: 0
            };
        }

        return {
            running: this.#master.state === 'master',
            peerAddress: this.#peerAddress,
            clockIdentity: this.#master.clockIdentity.toString('hex'),
            eventPort: this.#master.eventPort,
            generalPort: this.#master.generalPort,
            state: this.#master.state,
            syncsSent: this.#master.syncsSent,
            announcesSent: this.#master.announcesSent,
            delayReqsReceived: this.#master.delayReqsReceived,
            delayRespsSent: this.#master.delayRespsSent,
            announcesReceived: this.#master.announcesReceived
        };
    }

    async start(address: string): Promise<PtpMasterSnapshot> {
        if (this.#master) {
            this.stop();
        }

        this.#peerAddress = address;

        const master = new PtpMaster(address);
        await master.start();
        this.#master = master;

        this.#pollTimer = setInterval(() => {
            this.#emit(this.snapshot());
        }, POLL_INTERVAL_MS);

        const snapshot = this.snapshot();
        this.#emit(snapshot);
        return snapshot;
    }

    stop(): PtpMasterSnapshot {
        if (this.#pollTimer) {
            clearInterval(this.#pollTimer);
            this.#pollTimer = null;
        }

        if (this.#master) {
            this.#master.stop();
            this.#master = null;
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

    #emit(snapshot: PtpMasterSnapshot): void {
        for (const listener of this.#listeners) {
            listener(snapshot);
        }
    }
}
