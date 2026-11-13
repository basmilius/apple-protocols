import { parentPort } from 'node:worker_threads';
import { decodeDirect } from './decodeDirect';

parentPort!.on('message', async (input: Uint8Array) => {
    try {
        const output = await decodeDirect(Buffer.from(input.buffer, input.byteOffset, input.byteLength));
        parentPort!.postMessage({bytes: output}, [output.buffer as ArrayBuffer]);
    } catch (error) {
        parentPort!.postMessage({error: error instanceof Error ? error.message : String(error)});
    }
});
