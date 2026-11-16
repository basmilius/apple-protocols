import { Worker } from 'node:worker_threads';
import { PlaybackError } from '@apple-protocols/core';
import { decodeDirect } from './decodeDirect';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_PENDING = 8;
const MISSING_MODULE_CODES: readonly (string | undefined)[] = ['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'];

/** The worker could not load its file; the job runs in this thread instead. */
class WorkerUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkerUnavailableError';
    }
}

/** Set once the worker file failed to load, so later jobs skip the attempt. */
let workerUnavailable = false;

type Slot = {worker: Worker; finish?: (error?: Error, result?: Buffer) => void; idleTimer?: ReturnType<typeof setTimeout>; closed: boolean};
let active = 0;
const idle: Slot[] = [];
const pending: (() => void)[] = [];

// An explicit execArgv rejects V8 and per-process flags such as --expose-gc, which Homey passes.
// Inheriting skips those silently, so only --input-type, which breaks a file worker, needs an explicit list.
function workerExecArgv(): string[] | undefined {
    if (!process.execArgv.some(argument => argument.startsWith('--input-type'))) {
        return undefined;
    }

    return process.execArgv.filter((argument, index, args) => !argument.startsWith('--input-type') && args[index - 1] !== '--input-type');
}

function createSlot(): Slot {
    const path = new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './decode-worker.mjs', import.meta.url);
    const slot: Slot = {worker: new Worker(path, {execArgv: workerExecArgv()}), closed: false};

    slot.worker.on('message', (message: {bytes?: Uint8Array; error?: string}) => {
        const error = message.error ? new PlaybackError(message.error) : message.bytes ? undefined : new PlaybackError('Audio decoder returned no PCM data.');
        slot.finish?.(error, message.bytes ? Buffer.from(message.bytes.buffer, message.bytes.byteOffset, message.bytes.byteLength) : undefined);
    });

    slot.worker.on('error', error => {
        slot.closed = true;

        // The worker file is missing (a bundler may be rewriting its output) or cannot load from an archive.
        if (MISSING_MODULE_CODES.includes((error as NodeJS.ErrnoException).code)) {
            slot.finish?.(new WorkerUnavailableError((error as Error).message));

            return;
        }

        slot.finish?.(new PlaybackError(`Audio decode failed: ${error instanceof Error ? error.message : String(error)}`));
    });

    slot.worker.on('exit', code => {
        slot.closed = true;
        clearTimeout(slot.idleTimer);
        const index = idle.indexOf(slot);

        if (index >= 0) {
            idle.splice(index, 1);
        }

        slot.finish?.(new PlaybackError(`Audio decoder exited before replying (${code}).`));
    });

    return slot;
}

/**
 * Decodes to signed 16-bit big-endian stereo PCM at 44100 Hz. Two reusable workers keep the WASM
 * initialization off later jobs and bound concurrent PCM allocations. When the worker file cannot
 * load, the decoding runs in this thread instead.
 */
export async function decode(buffer: Buffer, options: {signal?: AbortSignal} = {}): Promise<Buffer> {
    if (buffer.length > MAX_INPUT_BYTES || pending.length >= MAX_PENDING) {
        throw new PlaybackError('Audio exceeds the decode input or pending-job limit.');
    }

    options.signal?.throwIfAborted();

    if (!workerUnavailable) {
        try {
            return await decodeInWorker(buffer, options);
        } catch (err) {
            if (!(err instanceof WorkerUnavailableError)) {
                throw err;
            }

            workerUnavailable = true;
        }
    }

    options.signal?.throwIfAborted();

    try {
        return await decodeDirect(buffer);
    } catch (err) {
        throw new PlaybackError(`Audio decode failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function decodeInWorker(buffer: Buffer, options: {signal?: AbortSignal}): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const run = (): void => {
            options.signal?.removeEventListener('abort', cancelPending);
            active++;
            let slot: Slot;
            let timer: ReturnType<typeof setTimeout>;
            let settled = false;

            const finish = (error?: Error, result?: Buffer): void => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
                const cancelled = options.signal?.aborted || slot?.closed || result === undefined;
                let stopped: Promise<unknown> = Promise.resolve();

                if (slot) {
                    slot.finish = undefined;

                    if (cancelled) {
                        slot.closed = true;
                        stopped = slot.worker.terminate();
                    } else {
                        slot.worker.unref();
                        idle.push(slot);

                        slot.idleTimer = setTimeout(() => {
                            const index = idle.indexOf(slot);

                            if (index >= 0) {
                                idle.splice(index, 1);
                            }

                            slot.closed = true;
                            void slot.worker.terminate();
                        }, 10000);

                        slot.idleTimer.unref();
                    }
                }

                void stopped.finally(() => {
                    active--;
                    pending.shift()?.();
                });

                if (error) {
                    reject(error);
                } else {
                    resolve(result!);
                }
            };

            const abort = (): void => finish(new PlaybackError('Audio decode cancelled.'));

            try {
                options.signal?.throwIfAborted();
                slot = idle.pop() ?? createSlot();
                clearTimeout(slot.idleTimer);
                slot.worker.ref();
                slot.finish = finish;
                const input = new Uint8Array(buffer.length);
                input.set(buffer);
                options.signal?.addEventListener('abort', abort, {once: true});
                timer = setTimeout(() => finish(new PlaybackError('Audio decoder timed out.')), 30000);
                slot.worker.postMessage(input, [input.buffer]);
            } catch (error) {
                finish(error instanceof Error ? error : new PlaybackError(String(error)));
            }
        };

        const cancelPending = (): void => {
            const index = pending.indexOf(run);

            if (index >= 0) {
                pending.splice(index, 1);
                reject(new PlaybackError('Audio decode cancelled.'));
            }
        };

        if (active < 2) {
            run();
        } else {
            pending.push(run);
            options.signal?.addEventListener('abort', cancelPending, {once: true});
        }
    });
}
