/** Resolves after `ms` milliseconds. */
export async function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
