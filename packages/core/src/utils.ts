/**
 * Returns a promise that resolves after the specified delay.
 * Commonly used for timing gaps in HID press/release sequences.
 *
 * @param ms - The delay in milliseconds.
 */
export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
