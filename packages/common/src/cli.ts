import { createInterface } from 'node:readline';

export async function prompt(message: string): Promise<string> {
    const cli = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise<string>(resolve => cli.question(`${message}: `, resolve));

    cli.close();

    return answer;
}

export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
