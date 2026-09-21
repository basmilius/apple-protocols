import type { DiscoveredDeviceInfo } from './contract';

/** File names under `~/.config/apple-protocols`. */
export const AGENT_STATE_FILE = 'diagnostics-agent.json';
export const AGENT_MARK_FILE = 'diagnostics-agent-mark.json';

/** What main writes once the bridge listens, and what the CLI reads to find it. */
export type AgentState = {
    readonly port: number;
    readonly token: string;
    readonly pid: number;
    readonly startedAt: number;
};

export type AgentKind = 'logs' | 'events' | 'traffic';

/** The newest cursor per buffer. Cursors restart at 0 when main restarts; `startedAt` tells the runs apart. */
export type AgentCursors = Record<AgentKind, number>;

export type AgentStatus = {
    readonly pid: number;
    readonly startedAt: number;
    /** True while the devices of the previous run are still being reconnected. */
    readonly resuming: boolean;
    readonly cursors: AgentCursors;
    readonly devices: readonly DiscoveredDeviceInfo[];
};

export type AgentPage<T = unknown> = {
    readonly entries: readonly T[];
    /** Pass as `after` to continue where this page stopped. */
    readonly next: number;
    /** True when `limit` cut the page short. */
    readonly more: boolean;
    readonly timedOut?: boolean;
};

export type AgentInvokeRequest = {
    readonly channel: string;
    readonly request?: unknown;
    /** Lifts the volume limit and the refusal of credential-removing channels. */
    readonly confirm?: boolean;
};
