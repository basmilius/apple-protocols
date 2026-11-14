import { BufferAudioSource } from './bufferAudioSource';
import { durationOf } from './const';
import { decode, isOgg } from './decoder';
import { fetchAudio, type FetchOptions } from './fetchAudio';

/** OGG Vorbis, decoded up front to signed 16-bit big-endian PCM by a WASM decoder. */
export class OggSource extends BufferAudioSource {
    private constructor(pcm: Buffer) {
        super(pcm, durationOf(pcm));
    }

    /** @throws {Error} When the data is not OGG. */
    static async fromBuffer(data: Buffer): Promise<OggSource> {
        if (!isOgg(data)) {
            throw new Error('Invalid OGG file');
        }

        return new OggSource(await decode(data));
    }

    /** Downloads and decodes an OGG Vorbis file. */
    static async fromUrl(url: string, options: FetchOptions = {}): Promise<OggSource> {
        return OggSource.fromBuffer(await fetchAudio(url, options));
    }
}
