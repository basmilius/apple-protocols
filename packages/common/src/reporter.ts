/**
 * Available debug output groups. Each group can be independently enabled
 * or disabled via the global {@link Reporter} singleton.
 */
export type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';

/**
 * A single log record handed to a {@link ReporterSink}.
 */
export type ReporterEntry = {
    /** The debug group the record belongs to. */
    readonly group: DebugGroup;
    /** The {@link Logger} identifier, or `null` for output not tied to a logger. */
    readonly deviceId: string | null;
    /** The values passed to the logging method, unformatted. */
    readonly args: readonly unknown[];
    /** Wall-clock milliseconds since the Unix epoch. */
    readonly timestamp: number;
};

/**
 * Receives every log record, whether or not its group prints to the console.
 */
export type ReporterSink = (entry: ReporterEntry) => void;

/**
 * Options for {@link Reporter.setSink}.
 */
export type ReporterSinkOptions = {
    /** Stops console output entirely while the sink is installed. Default: false. */
    readonly silenceConsole?: boolean;
    /** Limits which groups reach the sink. Default: every group. */
    readonly groups?: readonly DebugGroup[];
};

/** The framed channels whose messages can be tapped. */
export type TrafficProtocol = 'companionLink' | 'dataStream' | 'eventStream' | 'rtsp';

export type TrafficDirection = 'in' | 'out';

/**
 * One protocol message as it crossed the wire, after decryption or before encryption.
 */
export type TrafficEntry = {
    /** The {@link Logger} identifier of the device the message belongs to. */
    readonly deviceId: string | null;
    readonly protocol: TrafficProtocol;
    readonly direction: TrafficDirection;
    /** One line that identifies the message, for example `SETUP /stream cseq=4`. */
    readonly summary: string;
    /** The decoded message, when the caller has one. */
    readonly decoded?: unknown;
    /** The plaintext frame. */
    readonly bytes?: Uint8Array;
    /** Wall-clock milliseconds since the Unix epoch. */
    readonly timestamp: number;
};

export type TrafficSink = (entry: TrafficEntry) => void;

const ALL_GROUPS: readonly DebugGroup[] = ['debug', 'error', 'info', 'net', 'raw', 'warn'];

/**
 * Scoped logger instance tagged with a device or component identifier.
 * All log output is gated by the global {@link reporter} singleton — messages
 * are only printed when the corresponding debug group is enabled.
 */
export class Logger {
    /** The identifier this logger is scoped to. */
    get id(): string {
        return this.#id;
    }

    /** ANSI-colored label prefix used in log output. */
    get label(): string {
        return this.#label;
    }

    readonly #id: string;
    readonly #label: string;

    /**
     * @param id - Identifier used as a prefix in log output (typically a device ID or component name).
     */
    constructor(id: string) {
        this.#id = id;
        this.#label = `\u001b[36m[${id}]\u001b[39m`;
    }

    /**
     * Logs a debug-level message (cyan). Only printed when the 'debug' group is enabled.
     */
    debug(...data: any[]): void {
        write('debug', this.#id, this.#label, data);
    }

    /**
     * Logs an error-level message (red). Only printed when the 'error' group is enabled.
     */
    error(...data: any[]): void {
        write('error', this.#id, this.#label, data);
    }

    /**
     * Logs an info-level message (green). Only printed when the 'info' group is enabled.
     */
    info(...data: any[]): void {
        write('info', this.#id, this.#label, data);
    }

    /**
     * Logs a network-level message (yellow). Only printed when the 'net' group is enabled.
     */
    net(...data: any[]): void {
        write('net', this.#id, this.#label, data);
    }

    /**
     * Logs a raw data message (blue). Only printed when the 'raw' group is enabled.
     * Typically used for hex dumps and binary protocol data.
     */
    raw(...data: any[]): void {
        write('raw', this.#id, this.#label, data);
    }

    /**
     * Logs a warning-level message (yellow). Only printed when the 'warn' group is enabled.
     */
    warn(...data: any[]): void {
        write('warn', this.#id, this.#label, data);
    }

    /**
     * Hands one protocol message to the traffic sink. Does nothing without a sink, so callers
     * that have to build `decoded` first should check {@link Reporter.tapsTraffic}.
     *
     * @param protocol - The channel the message crossed.
     * @param direction - `out` for what we sent, `in` for what the device sent.
     * @param summary - One line that identifies the message.
     * @param decoded - The decoded message.
     * @param bytes - The plaintext frame.
     */
    traffic(protocol: TrafficProtocol, direction: TrafficDirection, summary: string, decoded?: unknown, bytes?: Uint8Array): void {
        reporter.reportTraffic({deviceId: this.#id, protocol, direction, summary, decoded, bytes, timestamp: Date.now()});
    }
}

/**
 * Global log output controller that manages which debug groups are active.
 * All {@link Logger} instances check the singleton {@link reporter} before printing.
 */
export class Reporter {
    #enabled: DebugGroup[] = [];
    #sink: ReporterSink | null = null;
    #sinkGroups: readonly DebugGroup[] = ALL_GROUPS;
    #silenceConsole = false;
    #trafficSink: TrafficSink | null = null;

    /** Whether a traffic sink is installed. */
    get tapsTraffic(): boolean {
        return this.#trafficSink !== null;
    }

    /** Enables all debug groups (except 'raw' which is very verbose). */
    all(): void {
        this.#enabled = ['debug', 'error', 'info', 'net', 'warn'] as DebugGroup[];
    }

    /** Disables all debug groups, silencing all log output. */
    none(): void {
        this.#enabled = [];
    }

    /**
     * Disables a specific debug group.
     *
     * @param group - The debug group to disable.
     */
    disable(group: DebugGroup): void {
        if (this.#enabled.includes(group)) {
            this.#enabled.splice(this.#enabled.indexOf(group), 1);
        }
    }

    /**
     * Enables a specific debug group.
     *
     * @param group - The debug group to enable.
     */
    enable(group: DebugGroup): void {
        if (!this.#enabled.includes(group)) {
            this.#enabled.push(group);
        }
    }

    /**
     * Checks whether a specific debug group is currently enabled.
     *
     * @param group - The debug group to check.
     * @returns True if the group is enabled.
     */
    isEnabled(group: DebugGroup): boolean {
        return this.#enabled.includes(group);
    }

    /**
     * Installs a sink that receives every log record, regardless of which groups
     * print. Replaces a sink that was already installed.
     *
     * @param sink - Receives one record per logging call.
     * @param options - Console silencing and group filtering.
     */
    setSink(sink: ReporterSink, options: ReporterSinkOptions = {}): void {
        this.#sink = sink;
        this.#sinkGroups = options.groups ?? ALL_GROUPS;
        this.#silenceConsole = options.silenceConsole === true;
    }

    /** Removes the installed sink and restores console output. */
    clearSink(): void {
        this.#sink = null;
        this.#sinkGroups = ALL_GROUPS;
        this.#silenceConsole = false;
    }

    /**
     * Installs a sink that receives every tapped protocol message. Replaces a sink that was
     * already installed.
     *
     * @param sink - Receives one entry per message.
     */
    setTrafficSink(sink: TrafficSink): void {
        this.#trafficSink = sink;
    }

    /** Removes the installed traffic sink. */
    clearTrafficSink(): void {
        this.#trafficSink = null;
    }

    /**
     * Hands one entry to the traffic sink, swallowing a failing sink like {@link report} does.
     *
     * @param entry - The tapped message.
     */
    reportTraffic(entry: TrafficEntry): void {
        if (this.#trafficSink === null) {
            return;
        }

        try {
            this.#trafficSink(entry);
        } catch {
            /* Sink errors must not interrupt protocol operations. */
        }
    }

    /**
     * Whether a group still reaches the console. False while a sink asked to take
     * console output over.
     *
     * @param group - The debug group to check.
     */
    printsToConsole(group: DebugGroup): boolean {
        return !this.#silenceConsole && this.#enabled.includes(group);
    }

    /**
     * Hands one record to the installed sink. A throwing sink must never take the
     * caller down with it, so the failure is swallowed here.
     *
     * @param group - The debug group of the record.
     * @param deviceId - The logger identifier, or null when there is none.
     * @param args - The values passed to the logging method.
     */
    report(group: DebugGroup, deviceId: string | null, args: readonly unknown[]): void {
        if (this.#sink === null || !this.#sinkGroups.includes(group)) {
            return;
        }

        try {
            this.#sink({group, deviceId, args, timestamp: Date.now()});
        } catch {
            /* Sink errors must not interrupt protocol operations. */
        }
    }
}

/** How each group prints: the console method and the ANSI color of its tag. */
const CONSOLE: Record<DebugGroup, { method: 'debug' | 'error' | 'info' | 'log' | 'warn'; color: string }> = {
    debug: {method: 'debug', color: '36'},
    error: {method: 'error', color: '31'},
    info: {method: 'info', color: '32'},
    net: {method: 'info', color: '33'},
    raw: {method: 'log', color: '34'},
    warn: {method: 'warn', color: '33'}
};

/**
 * The single path every {@link Logger} method takes: the console, gated by the
 * enabled groups, and the sink, which sees a record whether or not it printed.
 *
 * @param group - The debug group of the record.
 * @param id - The logger identifier, or null when the record has no logger.
 * @param label - ANSI-colored prefix printed before the values.
 * @param data - The values passed to the logging method.
 */
function write(group: DebugGroup, id: string | null, label: string | null, data: readonly unknown[]): void {
    reporter.report(group, id, data);

    if (!reporter.printsToConsole(group)) {
        return;
    }

    const {method, color} = CONSOLE[group];
    const tag = `\u001b[${color}m[${group}]\u001b[39m`;

    if (label === null) {
        console[method](tag, ...data);
    } else {
        console[method](tag, label, ...data);
    }
}

/** Global reporter singleton controlling which debug groups produce output. */
export const reporter: Reporter = new Reporter();
