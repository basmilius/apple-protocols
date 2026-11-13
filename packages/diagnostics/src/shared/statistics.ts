import type { TrafficProtocol } from './contract';

export const STATISTICS_INTERVAL_MS = 2000;
export const STATISTICS_WINDOW_MS = 30 * 60_000;

export const STATISTICS_PROTOCOLS: readonly TrafficProtocol[] = ['dataStream', 'eventStream', 'companionLink', 'rtsp'];

export type TrafficBucket = Record<TrafficProtocol, number> & {
    readonly at: number;
};

export type LogBucket = {
    readonly at: number;
    readonly error: number;
    readonly warn: number;
};

export type MessageType = {
    readonly type: string;
    in: number;
    out: number;
};

export type StatisticsTotals = {
    received: number;
    sent: number;
    bytes: number;
    errors: number;
    warnings: number;
};

export type StatisticsSnapshot = {
    readonly start: number;
    readonly messages: readonly TrafficBucket[];
    readonly bytes: readonly TrafficBucket[];
    readonly problems: readonly LogBucket[];
    readonly types: readonly MessageType[];
    readonly totals: StatisticsTotals;
};

/** Includes the current interval, also when `now` falls exactly on its boundary. */
export const statisticsWindowStart = (now: number): number => Math.floor(now / STATISTICS_INTERVAL_MS) * STATISTICS_INTERVAL_MS + STATISTICS_INTERVAL_MS - STATISTICS_WINDOW_MS;
