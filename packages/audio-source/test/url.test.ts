import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode } from 'qoa-format';
import { Url } from '../src/url';
import { audioDecode } from '../src/decoder/audioDecode';

function wav(): Buffer {
    const buffer = Buffer.alloc(52);
    buffer.write('RIFF'); buffer.writeUInt32LE(44, 4); buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
    buffer.writeUInt32LE(44100, 24); buffer.writeUInt32LE(176400, 28);
    buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36); buffer.writeUInt32LE(8, 40);
    buffer.writeInt16LE(16384, 44); buffer.writeInt16LE(-16384, 46);
    return buffer;
}

test('URL audio uses all shared codecs and rejects unsupported content', async () => {
    const original = globalThis.fetch;
    try {
        const flac = readFileSync(new URL('./fixtures/tone.flac', import.meta.url));
        const qoa = encode({channelData: [new Float32Array(441), new Float32Array(441)], sampleRate: 44100});
        for (const bytes of [wav(), flac, qoa]) {
            globalThis.fetch = (async () => new Response(new Uint8Array(bytes))) as typeof fetch;
            const source = await Url.fromUrl('https://offline.invalid/audio');
            assert.ok(source.duration > 0);
            const pcm = await source.readFrames(441);
            assert.ok(pcm && pcm.length > 0 && pcm.length % 4 === 0);
            assert.notDeepEqual(pcm, bytes);
        }
        globalThis.fetch = (async () => new Response('<html>upstream error</html>')) as typeof fetch;
        await assert.rejects(Url.fromUrl('https://offline.invalid/audio'), error => {
            assert.match((error as Error).message, /decode/);
            assert.ok((error as Error).cause);
            return true;
        });
        globalThis.fetch = (async () => new Response(new Uint8Array([0, 1, 0, 2]))) as typeof fetch;
        const pcm = await Url.fromUrl('https://offline.invalid/audio', {format: 'pcm'});
        assert.deepEqual(await pcm.readFrames(1), Buffer.from([0, 1, 0, 2]));
        globalThis.fetch = (async () => new Response(new Uint8Array([0, 1, 0]))) as typeof fetch;
        await assert.rejects(Url.fromUrl('https://offline.invalid/audio', {format: 'pcm'}), /complete stereo frames/);
        const failure = new Error('Interrupted body');
        globalThis.fetch = (async () => new Response(new ReadableStream({start(controller) { controller.error(failure); }}))) as typeof fetch;
        await assert.rejects(Url.fromUrl('https://offline.invalid/audio'), error => (error as Error).cause === failure);
    } finally {
        globalThis.fetch = original;
    }
});
test('decoder respects byteOffset and byteLength of sliced input', async () => {
    const audio = wav();
    const allocation = Buffer.alloc(audio.length + 128, 255);
    audio.copy(allocation, 64);
    const decoded = await audioDecode(allocation.subarray(64, 64 + audio.length));
    assert.equal(decoded.numberOfChannels, 2);
    assert.equal(decoded.length, 2);
    assert.ok(Math.abs(decoded.getChannelData(0)[0] - 0.5) < 0.0001);
});

test('decoder accepts a standalone ArrayBuffer', async () => {
    const decoded = await audioDecode(Uint8Array.from(wav()).buffer);
    assert.equal(decoded.sampleRate, 44100);
    assert.equal(decoded.length, 2);
});
