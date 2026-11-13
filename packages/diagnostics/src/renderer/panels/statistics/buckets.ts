import type { LogEntry, TrafficProtocol, TrafficRecord } from '@shared/contract';

/** Five seconds a column, so a heartbeat every few seconds still reads as a steady row. */
export const BUCKET_MS = 5000;
export const WINDOW_MS = 5 * 60_000;

export const PROTOCOLS: readonly TrafficProtocol[] = ['dataStream', 'eventStream', 'companionLink', 'rtsp'];

export type TrafficBucket = Record<TrafficProtocol, number> & {
    readonly at: number;
};

export type LogBucket = {
    readonly at: number;
    error: number;
    warn: number;
};

export type MessageType = {
    readonly type: string;
    in: number;
    out: number;
};

/** The start of the window that ends with the bucket `now` falls in. */
export const windowStart = (now: number): number => Math.ceil(now / BUCKET_MS) * BUCKET_MS - WINDOW_MS;

const bucketStarts = (start: number): number[] => Array.from({length: WINDOW_MS / BUCKET_MS}, (_, index) => start + index * BUCKET_MS);

const indexOf = (timestamp: number, start: number): number | null => {
    const index = Math.floor((timestamp - start) / BUCKET_MS);

    return index >= 0 && index < WINDOW_MS / BUCKET_MS ? index : null;
};

/** Sums `measure` per protocol and bucket. Empty buckets stay in, so a silence draws as a gap in the columns. */
export const trafficBuckets = (records: readonly TrafficRecord[], start: number, measure: (record: TrafficRecord) => number): TrafficBucket[] => {
    const buckets = bucketStarts(start).map(at => ({at, dataStream: 0, eventStream: 0, companionLink: 0, rtsp: 0}));

    for (const record of records) {
        const index = indexOf(record.timestamp, start);

        if (index !== null) {
            buckets[index][record.protocol] += measure(record);
        }
    }

    return buckets;
};

export const logBuckets = (logs: readonly LogEntry[], start: number): LogBucket[] => {
    const buckets = bucketStarts(start).map(at => ({at, error: 0, warn: 0}));

    for (const entry of logs) {
        const index = indexOf(entry.timestamp, start);

        if (index !== null && (entry.group === 'error' || entry.group === 'warn')) {
            buckets[index][entry.group] += 1;
        }
    }

    return buckets;
};

/* An RTSP summary ends in its sequence number and size, which would make every message a type of its own. */
const typeOf = (summary: string): string => summary.replace(/\s*cseq=\d+/, '').replace(/\s*\(\d+B\)/, '').trim();

export const topTypes = (records: readonly TrafficRecord[], start: number, limit: number): MessageType[] => {
    const types = new Map<string, MessageType>();

    for (const record of records) {
        if (indexOf(record.timestamp, start) === null) {
            continue;
        }

        const type = typeOf(record.summary);
        const entry = types.get(type) ?? {type, in: 0, out: 0};
        entry[record.direction] += 1;
        types.set(type, entry);
    }

    return Array.from(types.values())
        .sort((one, other) => other.in + other.out - (one.in + one.out))
        .slice(0, limit);
};
