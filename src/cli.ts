import { createInterface } from 'node:readline';
import { styleText } from 'node:util';

const stdin = createInterface({
    input: process.stdin,
    output: process.stdout
});

export function debug(...data: any[]): void {
    console.debug(styleText('cyan', '[debug]'), ...data);
}

export async function prompt(message: string): Promise<string> {
    return await new Promise<string>(resolve => stdin.question(`${message}: `, resolve));
}
