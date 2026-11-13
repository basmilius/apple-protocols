import type { LogEntry, TrafficProtocol, TrafficRecord } from '@shared/contract';
import { STATISTICS_INTERVAL_MS, STATISTICS_WINDOW_MS, statisticsWindowStart, type MessageType, type StatisticsSnapshot, type StatisticsTotals } from '@shared/statistics';

/** Unusual summaries cannot create an unbounded set of message types in one interval. */
const MAX_TYPES_PER_INTERVAL = 128;
const TYPE_LIMIT = 12;
const OTHER_TYPE = 'Other message types';

type ProtocolCounts = Record<TrafficProtocol, number>;

type Bucket = {
    readonly messages: ProtocolCounts;
    readonly bytes: ProtocolCounts;
    readonly totals: StatisticsTotals;
    readonly types: Map<string, MessageType>;
};

const protocolCounts = (): ProtocolCounts => ({dataStream: 0, eventStream: 0, companionLink: 0, rtsp: 0});
const emptyTotals = (): StatisticsTotals => ({received: 0, sent: 0, bytes: 0, errors: 0, warnings: 0});

/* RTSP sequence numbers and frame sizes describe individual messages rather than message types. */
const typeOf = (summary: string): string => summary.replace(/\s*cseq=\d+/, '').replace(/\s*\(\d+B\)/, '').trim().slice(0, 256);

/** Keeps time-based counters independently of the payload buffers and the renderer's lifetime. */
export class StatisticsBuffer {
    readonly #devices = new Map<string | null, Map<number, Bucket>>();
    #start = -Infinity;

    recordTraffic(record: TrafficRecord): void {
        const bucket = this.#bucketFor(record.deviceId, record.timestamp);

        if (bucket === null) {
            return;
        }

        const size = record.size ?? 0;
        bucket.messages[record.protocol] += 1;
        bucket.bytes[record.protocol] += size;
        bucket.totals[record.direction === 'in' ? 'received' : 'sent'] += 1;
        bucket.totals.bytes += size;

        let type = typeOf(record.summary);

        if (!bucket.types.has(type) && bucket.types.size >= MAX_TYPES_PER_INTERVAL) {
            type = OTHER_TYPE;
        }

        const entry = bucket.types.get(type) ?? {type, in: 0, out: 0};
        entry[record.direction] += 1;
        bucket.types.set(type, entry);
    }

    recordLog(entry: LogEntry): void {
        if (entry.group !== 'error' && entry.group !== 'warn') {
            return;
        }

        const bucket = this.#bucketFor(entry.deviceId, entry.timestamp);

        if (bucket !== null) {
            bucket.totals[entry.group === 'error' ? 'errors' : 'warnings'] += 1;
        }
    }

    snapshot(deviceId: string | null, now = Date.now()): StatisticsSnapshot {
        this.#prune(now);

        const start = statisticsWindowStart(now);
        const buckets = this.#devices.get(deviceId);
        const messages: StatisticsSnapshot['messages'][number][] = [];
        const bytes: StatisticsSnapshot['bytes'][number][] = [];
        const problems: StatisticsSnapshot['problems'][number][] = [];
        const totals = emptyTotals();
        const types = new Map<string, MessageType>();

        for (let at = start; at < start + STATISTICS_WINDOW_MS; at += STATISTICS_INTERVAL_MS) {
            const bucket = buckets?.get(at);
            messages.push({at, ...(bucket?.messages ?? protocolCounts())});
            bytes.push({at, ...(bucket?.bytes ?? protocolCounts())});
            problems.push({at, error: bucket?.totals.errors ?? 0, warn: bucket?.totals.warnings ?? 0});

            if (bucket === undefined) {
                continue;
            }

            totals.bytes += bucket.totals.bytes;
            totals.received += bucket.totals.received;
            totals.sent += bucket.totals.sent;
            totals.errors += bucket.totals.errors;
            totals.warnings += bucket.totals.warnings;

            for (const entry of bucket.types.values()) {
                const type = types.get(entry.type) ?? {type: entry.type, in: 0, out: 0};
                type.in += entry.in;
                type.out += entry.out;
                types.set(entry.type, type);
            }
        }

        return {
            start,
            messages,
            bytes,
            problems,
            totals,
            types: [...types.values()].sort((one, other) => other.in + other.out - one.in - one.out).slice(0, TYPE_LIMIT)
        };
    }

    #bucketFor(deviceId: string | null, timestamp: number): Bucket | null {
        this.#prune(timestamp);

        const at = Math.floor(timestamp / STATISTICS_INTERVAL_MS) * STATISTICS_INTERVAL_MS;

        if (at < this.#start) {
            return null;
        }

        let buckets = this.#devices.get(deviceId);

        if (buckets === undefined) {
            buckets = new Map();
            this.#devices.set(deviceId, buckets);
        }

        let bucket = buckets.get(at);

        if (bucket === undefined) {
            bucket = {messages: protocolCounts(), bytes: protocolCounts(), totals: emptyTotals(), types: new Map()};
            buckets.set(at, bucket);
        }

        return bucket;
    }

    #prune(now: number): void {
        const start = statisticsWindowStart(now);

        if (start <= this.#start) {
            return;
        }

        this.#start = start;

        for (const [deviceId, buckets] of this.#devices) {
            for (const at of buckets.keys()) {
                if (at < start) {
                    buckets.delete(at);
                }
            }

            if (buckets.size === 0) {
                this.#devices.delete(deviceId);
            }
        }
    }
}
