type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';

export class Logger {
    readonly #id: string;

    constructor(id: string) {
        this.#id = id;
    }

    debug(...data: any[]): void {
        debug(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
    }

    error(...data: any[]): void {
        error(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
    }

    info(...data: any[]): void {
        info(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
    }

    net(...data: any[]): void {
        net(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
    }

    raw(...data: any[]): void {
        raw(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
    }

    warn(...data: any[]): void {
        warn(`\u001b[36m[${this.#id}]\u001b[39m`, ...data);
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
