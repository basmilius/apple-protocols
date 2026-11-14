import { BufferAudioSource } from './bufferAudioSource';
import { durationOf } from './const';
import { decode, isMp3 } from './decoder';
import { fetchAudio, type FetchOptions } from './fetchAudio';

/** MP3, decoded up front to signed 16-bit big-endian PCM by a WASM decoder. */
export class Mp3Source extends BufferAudioSource {
    private constructor(pcm: Buffer) {
        super(pcm, durationOf(pcm));
    }

    /** @throws {Error} When the data is not MP3. */
    static async fromBuffer(data: Buffer): Promise<Mp3Source> {
        if (!isMp3(data)) {
            throw new Error('Invalid MP3 file');
        }

        return new Mp3Source(await decode(data));
    }

    /** Downloads and decodes an MP3. */
    static async fromUrl(url: string, options: FetchOptions = {}): Promise<Mp3Source> {
        return Mp3Source.fromBuffer(await fetchAudio(url, options));
    }
}
