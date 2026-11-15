import { CatalogError } from './errors';

const MAX_BODY_SIZE = 2 * 1024 * 1024;

/**
 * Reads a response body as text, up to 2 MB. A read that fails or times out midway becomes a
 * {@link CatalogError} like the request itself.
 */
export async function readBody(response: Response, what: string): Promise<string> {
    const reader = response.body?.getReader();

    if (!reader) {
        throw new CatalogError('invalidResponse', `Apple Music returned an empty ${what}.`);
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
        while (true) {
            const {done, value} = await reader.read();

            if (done) {
                break;
            }

            size += value.byteLength;

            if (size > MAX_BODY_SIZE) {
                throw new CatalogError('tooLarge', `Apple Music ${what} exceeds 2 MB.`);
            }

            chunks.push(value);
        }
    } catch (err) {
        if (err instanceof CatalogError) {
            throw err;
        }

        const error = new CatalogError('requestFailed', `Reading the Apple Music ${what} failed or timed out.`);
        error.cause = err;

        throw error;
    } finally {
        await reader.cancel().catch(() => undefined);
    }

    return Buffer.concat(chunks).toString('utf8');
}
