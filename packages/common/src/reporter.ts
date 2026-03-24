/**
 * Available debug output groups. Each group can be independently enabled
 * or disabled via the global {@link Reporter} singleton.
 */
type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';

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
     *
     * @param data - Values to log.
     */
    debug(...data: any[]): void {
        debug(this.#label, ...data);
    }

    /**
     * Logs an error-level message (red). Only printed when the 'error' group is enabled.
     *
     * @param data - Values to log.
     */
    error(...data: any[]): void {
        error(this.#label, ...data);
    }

    /**
     * Logs an info-level message (green). Only printed when the 'info' group is enabled.
     *
     * @param data - Values to log.
     */
    info(...data: any[]): void {
        info(this.#label, ...data);
    }

    /**
     * Logs a network-level message (yellow). Only printed when the 'net' group is enabled.
     *
     * @param data - Values to log.
     */
    net(...data: any[]): void {
        net(this.#label, ...data);
    }

    /**
     * Logs a raw data message (blue). Only printed when the 'raw' group is enabled.
     * Typically used for hex dumps and binary protocol data.
     *
     * @param data - Values to log.
     */
    raw(...data: any[]): void {
        raw(this.#label, ...data);
    }

    /**
     * Logs a warning-level message (yellow). Only printed when the 'warn' group is enabled.
     *
     * @param data - Values to log.
     */
    warn(...data: any[]): void {
        warn(this.#label, ...data);
    }
}

/**
 * Global log output controller that manages which debug groups are active.
 * All {@link Logger} instances check the singleton {@link reporter} before printing.
 */
export class Reporter {
    #enabled: DebugGroup[] = [];

    /** Enables all debug groups (except 'raw' which is very verbose). */
    all(): void {
        // this.#enabled = ['debug', 'error', 'info', 'net', 'raw', 'warn'] as DebugGroup[];
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
}

/**
 * Logs a debug-level message if the 'debug' group is enabled.
 *
 * @param data - Values to log.
 */
function debug(...data: any[]): void {
    reporter.isEnabled('debug') && console.debug(`\u001b[36m[debug]\u001b[39m`, ...data);
}

/**
 * Logs an error-level message if the 'error' group is enabled.
 *
 * @param data - Values to log.
 */
function error(...data: any[]): void {
    reporter.isEnabled('error') && console.error(`\u001b[31m[error]\u001b[39m`, ...data);
}

/**
 * Logs an info-level message if the 'info' group is enabled.
 *
 * @param data - Values to log.
 */
function info(...data: any[]): void {
    reporter.isEnabled('info') && console.info(`\u001b[32m[info]\u001b[39m`, ...data);
}

/**
 * Logs a network-level message if the 'net' group is enabled.
 *
 * @param data - Values to log.
 */
function net(...data: any[]): void {
    reporter.isEnabled('net') && console.info(`\u001b[33m[net]\u001b[39m`, ...data);
}

/**
 * Logs a raw data message if the 'raw' group is enabled.
 *
 * @param data - Values to log.
 */
function raw(...data: any[]): void {
    reporter.isEnabled('raw') && console.log(`\u001b[34m[raw]\u001b[39m`, ...data);
}

/**
 * Logs a warning-level message if the 'warn' group is enabled.
 *
 * @param data - Values to log.
 */
function warn(...data: any[]): void {
    reporter.isEnabled('warn') && console.warn(`\u001b[33m[warn]\u001b[39m`, ...data);
}

/** Global reporter singleton controlling which debug groups produce output. */
export const reporter: Reporter = new Reporter();
