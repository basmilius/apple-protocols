import { pad } from 'lodash-es';

type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';

export class Logger {
    get id(): string {
        return this.#id;
    }

    get label(): string {
        return this.#label;
    }

    readonly #id: string;
    readonly #label: string;

    constructor(id: string) {
        this.#id = id;
        this.#label = `\u001b[36m[${pad(id, 16)}]\u001b[39m`;
    }

    debug(...data: any[]): void {
        debug(this.#label, ...data);
    }

    error(...data: any[]): void {
        error(this.#label, ...data);
    }

    info(...data: any[]): void {
        info(this.#label, ...data);
    }

    net(...data: any[]): void {
        net(this.#label, ...data);
    }

    raw(...data: any[]): void {
        raw(this.#label, ...data);
    }

    warn(...data: any[]): void {
        warn(this.#label, ...data);
    }
}

export class Reporter {
    #enabled: DebugGroup[] = [];

    all(): void {
        this.#enabled = ['debug', 'error', 'info', 'net', 'raw', 'warn'] as DebugGroup[];
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

    isEnabled(group: DebugGroup): boolean {
        return this.#enabled.includes(group);
    }
}

function debug(...data: any[]): void {
    reporter.isEnabled('debug') && console.debug(`\u001b[36m[debug]\u001b[39m`, ...data);
}

function error(...data: any[]): void {
    reporter.isEnabled('error') && console.error(`\u001b[31m[error]\u001b[39m`, ...data);
}

function info(...data: any[]): void {
    reporter.isEnabled('info') && console.info(`\u001b[32m[info]\u001b[39m`, ...data);
}

function net(...data: any[]): void {
    reporter.isEnabled('net') && console.info(`\u001b[33m[net]\u001b[39m`, ...data);
}

function raw(...data: any[]): void {
    reporter.isEnabled('raw') && console.log(`\u001b[34m[raw]\u001b[39m`, ...data);
}

function warn(...data: any[]): void {
    reporter.isEnabled('warn') && console.warn(`\u001b[33m[warn]\u001b[39m`, ...data);
}

export const reporter: Reporter = new Reporter();
