import { PlaybackError } from '@basmilius/apple-common';

export async function fetchAudio(url: string, options: {signal?: AbortSignal; maxBytes?: number; timeoutMs?: number} = {}): Promise<Buffer> {
    const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    const timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError('Audio download limits must be positive integers.');
    }
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
    const response = await fetch(url, {signal});
    if (!response.ok) {
        await response.body?.cancel();
        throw new PlaybackError(`Audio download failed: ${response.status} ${response.statusText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new PlaybackError('Audio response has no body.');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            size += chunk.value.byteLength;
            if (size > maxBytes) {
                throw new PlaybackError(`Audio download exceeds ${maxBytes} bytes.`);
            }
            chunks.push(Buffer.from(chunk.value));
        }
        return Buffer.concat(chunks, size);
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
