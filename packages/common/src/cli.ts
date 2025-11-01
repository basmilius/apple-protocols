import { createInterface } from 'node:readline';

const stdin = createInterface({
    input: process.stdin,
    output: process.stdout
});

export function debug(...data: any[]): void {
    console.debug('\u001b[36m[debug]\u001b[39m', ...data);
}

export async function prompt(message: string): Promise<string> {
    return await new Promise<string>(resolve => stdin.question(`${message}: `, resolve));
}

export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
