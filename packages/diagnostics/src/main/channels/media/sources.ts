import { readFile } from 'node:fs/promises';
import { Ffmpeg, File, Live, Mp3, Ogg, Pcm, SineWave, Url, Wav } from '@basmilius/apple-audio-source';
import type { AudioSource } from '@basmilius/apple-common';
import type { AudioSourceSpec } from '@shared/contract';

/** 44100 Hz, 16 bit, stereo: the format every AirPlay receiver in this repo negotiates. */
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;

/** How often the generated tone is topped up into a {@link Live} ring buffer. */
const LIVE_CHUNK_MS = 200;

export type BuiltSource = {
    readonly source: AudioSource;
    /** What the status event shows for this source. */
    readonly description: string;
    /** Stops whatever keeps feeding the source, for {@link Live}. */
    dispose(): void;
};

/**
 * Turns the renderer's description of a source into the real thing.
 *
 * @param spec - Which audio source class to build and what to feed it.
 */
export async function buildSource(spec: AudioSourceSpec): Promise<BuiltSource> {
    switch (spec.kind) {
        case 'url':
            return plain(await Url.fromUrl(demand(spec.url, 'url')), `Url ${spec.url}`);

        case 'file':
            return plain(await File.fromPath(demand(spec.path, 'path')), `File ${spec.path}`);

        case 'wav':
            return plain(await decoded(spec, Wav), `Wav ${describeOrigin(spec)}`);

        case 'mp3':
            return plain(await decoded(spec, Mp3), `Mp3 ${describeOrigin(spec)}`);

        case 'ogg':
            return plain(await decoded(spec, Ogg), `Ogg ${describeOrigin(spec)}`);

        case 'pcm': {
            const buffer = await readFile(demand(spec.path, 'path'));
            return plain(new Pcm(buffer, spec.sampleRate ?? SAMPLE_RATE), `Pcm ${spec.path} at ${spec.sampleRate ?? SAMPLE_RATE} Hz`);
        }

        case 'sineWave':
            return plain(new SineWave(spec.duration, spec.frequency), `SineWave ${spec.frequency} Hz for ${spec.duration}s`);

        case 'ffmpeg':
            return plain(new Ffmpeg(demand(spec.path, 'path'), spec.duration), `Ffmpeg ${spec.path}`);

        case 'live':
            return live(spec);

        default:
            throw new Error(`Unknown audio source kind '${(spec as AudioSourceSpec).kind}'.`);
    }
}

type FromBuffer = {
    fromBuffer(buffer: Buffer): Promise<AudioSource>;
    fromUrl(url: string): Promise<AudioSource>;
};

/**
 * A {@link Live} source fed a generated tone, which is the only way to exercise the ring buffer
 * path without a real capture device.
 */
function live(spec: Extract<AudioSourceSpec, { kind: 'live' }>): BuiltSource {
    const source = new Live(spec.bufferDuration ?? 2);
    const frameBytes = CHANNELS * BYTES_PER_CHANNEL;
    const chunkFrames = Math.floor((SAMPLE_RATE * LIVE_CHUNK_MS) / 1000);
    const endsAt = Date.now() + spec.duration * 1000;

    let phase = 0;

    const timer = setInterval(() => {
        if (Date.now() >= endsAt) {
            clearInterval(timer);
            source.end();

            return;
        }

        const chunk = Buffer.alloc(chunkFrames * frameBytes);

        for (let i = 0; i < chunkFrames; i++) {
            const sample = Math.round(Math.sin(phase) * 0x3fff);
            phase += (2 * Math.PI * spec.frequency) / SAMPLE_RATE;

            chunk.writeInt16LE(sample, i * frameBytes);
            chunk.writeInt16LE(sample, i * frameBytes + BYTES_PER_CHANNEL);
        }

        source.write(chunk);
    }, LIVE_CHUNK_MS);

    return {
        source,
        description: `Live ${spec.frequency} Hz for ${spec.duration}s`,
        dispose: () => {
            clearInterval(timer);
            source.end();
        }
    };
}

async function decoded(spec: Extract<AudioSourceSpec, { from: 'url' | 'file' }>, decoder: FromBuffer): Promise<AudioSource> {
    if (spec.from === 'url') {
        return await decoder.fromUrl(demand(spec.url, 'url'));
    }

    return await decoder.fromBuffer(await readFile(demand(spec.path, 'path')));
}

function describeOrigin(spec: Extract<AudioSourceSpec, { from: 'url' | 'file' }>): string {
    return spec.from === 'url' ? (spec.url ?? '') : (spec.path ?? '');
}

function plain(source: AudioSource, description: string): BuiltSource {
    return {source, description, dispose: () => undefined};
}

function demand(value: string | undefined, name: string): string {
    if (value === undefined || value.trim().length === 0) {
        throw new Error(`This audio source needs a ${name}.`);
    }

    return value.trim();
}
