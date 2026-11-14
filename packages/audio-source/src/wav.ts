import { BufferAudioSource } from './bufferAudioSource';
import { durationOf } from './const';
import { decode, isWav } from './decoder';
import { fetchAudio, type FetchOptions } from './fetchAudio';

/** WAV, including WAVE_FORMAT_EXTENSIBLE, decoded up front to signed 16-bit big-endian PCM. */
export class WavSource extends BufferAudioSource {
    private constructor(pcm: Buffer) {
        super(pcm, durationOf(pcm));
    }

    /** @throws {Error} When the data is not WAV. */
    static async fromBuffer(data: Buffer): Promise<WavSource> {
        if (!isWav(data)) {
            throw new Error('Invalid WAV file');
        }

        return new WavSource(await decode(data));
    }

    /** Downloads and decodes a WAV file. */
    static async fromUrl(url: string, options: FetchOptions = {}): Promise<WavSource> {
        return WavSource.fromBuffer(await fetchAudio(url, options));
    }
}
