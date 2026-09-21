import { reporter, type TrafficEntry } from '@basmilius/apple-sdk';
import type { TrafficRecord } from '@shared/contract';
import { Ring } from './ring';
import { serialize } from './serialize';

const CAPACITY = 5000;

/** A frame past this is cut in the buffer; `size` keeps the real length. Artwork alone can be megabytes. */
const MAX_FRAME_BYTES = 16 * 1024;

export class TrafficBuffer {
    readonly #ring = new Ring<TrafficRecord>(CAPACITY, record => record.id);
    readonly #listeners = new Set<(record: TrafficRecord) => void>();

    #next = 1;

    constructor() {
        this.onTraffic = this.onTraffic.bind(this);
    }

    get ring(): Ring<TrafficRecord> {
        return this.#ring;
    }

    install(): void {
        reporter.setTrafficSink(this.onTraffic);
    }

    onListener(listener: (record: TrafficRecord) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    onTraffic(entry: TrafficEntry): void {
        const bytes = entry.bytes ?? null;

        const record: TrafficRecord = {
            id: this.#next,
            deviceId: entry.deviceId,
            protocol: entry.protocol,
            direction: entry.direction,
            summary: entry.summary,
            decoded: serialize(entry.decoded),
            bytes: bytes === null ? null : Buffer.from(bytes.subarray(0, MAX_FRAME_BYTES)).toString('hex'),
            size: bytes?.byteLength ?? null,
            timestamp: entry.timestamp
        };

        this.#next += 1;
        this.#ring.push(record);

        for (const listener of this.#listeners) {
            listener(record);
        }
    }
}
