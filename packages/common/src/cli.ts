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


