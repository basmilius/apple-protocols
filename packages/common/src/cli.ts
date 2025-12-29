import { createInterface, type Interface } from 'node:readline';

export const cli: Interface = createInterface({
    input: process.stdin,
    output: process.stdout
});

export async function prompt(message: string): Promise<string> {
    return await new Promise<string>(resolve => cli.question(`${message}: `, resolve));
}

export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Reporter {
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

    debug(...data: any[]): void {
        this.isEnabled('debug') && console.debug(`\u001b[36m[debug]\u001b[39m`, ...data);
    }

    error(...data: any[]): void {
        this.isEnabled('error') && console.error(`\u001b[31m[error]\u001b[39m`, ...data);
    }

    info(...data: any[]): void {
        this.isEnabled('info') && console.info(`\u001b[32m[info]\u001b[39m`, ...data);
    }

    net(...data: any[]): void {
        this.isEnabled('net') && console.info(`\u001b[33m[net]\u001b[39m`, ...data);
    }

    raw(...data: any[]): void {
        this.isEnabled('raw') && console.log(`\u001b[34m[raw]\u001b[39m`, ...data);
    }

    warn(...data: any[]): void {
        this.isEnabled('warn') && console.warn(`\u001b[33m[warn]\u001b[39m`, ...data);
    }
}

export const reporter: Reporter = new Reporter();

type DebugGroup =
    | 'debug'
    | 'error'
    | 'info'
    | 'net'
    | 'raw'
    | 'warn';
