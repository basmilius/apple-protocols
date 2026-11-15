/** A log group. The global {@link reporter} turns each group on or off. */
export type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';

/** One log record, as a {@link ReporterSink} receives it. */
export type ReporterEntry = {
    readonly group: DebugGroup;

    /** The {@link Logger} identifier, or `null` for output not tied to a logger. */
    readonly deviceId: string | null;

    /** The values passed to the logging method, unformatted. */
    readonly args: readonly unknown[];

    /** Wall-clock milliseconds since the Unix epoch. */
    readonly timestamp: number;
};

/** Receives every log record, whether or not its group prints to the console. */
export type ReporterSink = (entry: ReporterEntry) => void;

/** Options for {@link Reporter.setSink}. */
export type ReporterSinkOptions = {
    /** Stops console output entirely while the sink is installed. Default: false. */
    readonly silenceConsole?: boolean;

    /** Limits which groups reach the sink. Default: every group. */
    readonly groups?: readonly DebugGroup[];
};

/** The label of the channel a tapped message crossed; each protocol package picks its own. */
export type TrafficProtocol = string;

export type TrafficDirection = 'in' | 'out';

/** One protocol message as it crossed the wire, after decryption or before encryption. */
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

/** Receives every record of one {@link Logger}, whichever groups the global reporter prints. */
export type LogSink = (group: DebugGroup, args: readonly unknown[]) => void;

const ALL_GROUPS: readonly DebugGroup[] = ['debug', 'error', 'info', 'net', 'raw', 'warn'];

/**
 * Logs under an identifier, usually a device id. The global {@link reporter} decides which groups
 * print.
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
    readonly #sink?: LogSink;

    /**
     * @param id - Prefix of every line, usually a device id.
     * @param sink - Also receives every record of this logger, next to the global reporter.
     */
    constructor(id: string, sink?: LogSink) {
        this.#id = id;
        this.#label = `\u001b[36m[${id}]\u001b[39m`;
        this.#sink = sink;
    }

    /** Logs in the `debug` group, in cyan. */
    debug(...data: any[]): void {
        this.#write('debug', data);
    }

    /** Logs in the `error` group, in red. */
    error(...data: any[]): void {
        this.#write('error', data);
    }

    /** Logs in the `info` group, in green. */
    info(...data: any[]): void {
        this.#write('info', data);
    }

    /** Logs in the `net` group, in yellow. */
    net(...data: any[]): void {
        this.#write('net', data);
    }

    /** Logs in the `raw` group, in blue; meant for hex dumps and binary protocol data. */
    raw(...data: any[]): void {
        this.#write('raw', data);
    }

    /** Logs in the `warn` group, in yellow. */
    warn(...data: any[]): void {
        this.#write('warn', data);
    }

    /**
     * Hands one protocol message to the traffic sink. Does nothing without a sink, so callers
     * that have to build `decoded` first should check {@link Reporter.tapsTraffic}.
     *
     * @param direction - `out` for what we sent, `in` for what the device sent.
     */
    traffic(protocol: TrafficProtocol, direction: TrafficDirection, summary: string, decoded?: unknown, bytes?: Uint8Array): void {
        reporter.reportTraffic({deviceId: this.#id, protocol, direction, summary, decoded, bytes, timestamp: Date.now()});
    }

    #write(group: DebugGroup, data: readonly unknown[]): void {
        write(group, this.#id, this.#label, data);

        if (!this.#sink) {
            return;
        }

        try {
            this.#sink(group, data);
        } catch {
            // A failing sink must not interrupt the protocol.
        }
    }
}

/**
 * Decides which log groups print, and where log records and traffic go. Every {@link Logger}
 * goes through the {@link reporter} singleton.
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

    /** Enables every group except the verbose `raw`. */
    all(): void {
        this.#enabled = ['debug', 'error', 'info', 'net', 'warn'] as DebugGroup[];
    }

    /** Disables every group. */
    none(): void {
        this.#enabled = [];
    }

    disable(group: DebugGroup): void {
        if (this.#enabled.includes(group)) {
            this.#enabled.splice(this.#enabled.indexOf(group), 1);
        }
    }

    enable(group: DebugGroup): void {
        if (!this.#enabled.includes(group)) {
            this.#enabled.push(group);
        }
    }

    /** Whether a group reaches the console or the sink, so a caller can skip building an expensive message. */
    accepts(group: DebugGroup): boolean {
        return this.printsToConsole(group) || (this.#sink !== null && this.#sinkGroups.includes(group));
    }

    isEnabled(group: DebugGroup): boolean {
        return this.#enabled.includes(group);
    }

    /**
     * Installs a sink that receives one record per logging call, whichever groups print. Replaces
     * a sink that was already installed.
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

    /** Installs a sink that receives every tapped protocol message. Replaces a sink that was already installed. */
    setTrafficSink(sink: TrafficSink): void {
        this.#trafficSink = sink;
    }

    /** Removes the installed traffic sink. */
    clearTrafficSink(): void {
        this.#trafficSink = null;
    }

    /** Hands one entry to the traffic sink, swallowing a failing sink like {@link report} does. */
    reportTraffic(entry: TrafficEntry): void {
        if (this.#trafficSink === null) {
            return;
        }

        try {
            this.#trafficSink(entry);
        } catch {
            // A failing sink must not interrupt the protocol.
        }
    }

    /** Whether a group still reaches the console. False while a sink silences the console. */
    printsToConsole(group: DebugGroup): boolean {
        return !this.#silenceConsole && this.#enabled.includes(group);
    }

    /**
     * Hands one record to the installed sink. A throwing sink must never take the caller down
     * with it, so this swallows the failure.
     *
     * @param deviceId - The logger identifier, or null when there is none.
     */
    report(group: DebugGroup, deviceId: string | null, args: readonly unknown[]): void {
        if (this.#sink === null || !this.#sinkGroups.includes(group)) {
            return;
        }

        try {
            this.#sink({group, deviceId, args, timestamp: Date.now()});
        } catch {
            // A failing sink must not interrupt the protocol.
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
 * The one path every {@link Logger} method takes. The console prints only the enabled groups; the
 * sink sees every record, whether or not it printed.
 *
 * @param id - The logger identifier, or null when the record has no logger.
 * @param label - ANSI-colored prefix printed before the values.
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

/** The global {@link Reporter} that decides which log groups print. */
export const reporter: Reporter = new Reporter();
