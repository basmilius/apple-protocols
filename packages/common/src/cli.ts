import { createInterface } from 'node:readline';

/**
 * Prompts the user for input via stdin and returns their response.
 *
 * @param message - The message to display before the input cursor.
 * @returns The user's input string.
 */
export async function prompt(message: string): Promise<string> {
    const cli = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise<string>(resolve => cli.question(`${message}: `, resolve));

    cli.close();

    return answer;
}

/**
 * Returns a promise that resolves after the specified delay.
 * Commonly used for timing gaps in HID press/release sequences.
 *
 * @param ms - The delay in milliseconds.
 */
export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
