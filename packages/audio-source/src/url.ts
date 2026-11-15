import { PlaybackError } from '@corewire/core';
import { BufferAudioSource } from './bufferAudioSource';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, durationOf } from './const';
import { decode } from './decoder';
import { fetchAudio, type FetchOptions } from './fetchAudio';

export type UrlSourceOptions = FetchOptions & {
    /** `pcm` for raw signed 16-bit big-endian stereo PCM at 44100 Hz; `encoded` (default) detects and decodes the format. */
    readonly format?: 'encoded' | 'pcm';
};

/** Audio from a URL in any format the shared decoder knows, downloaded and decoded up front. */
export class UrlSource extends BufferAudioSource {
    private constructor(pcm: Buffer) {
        super(pcm, durationOf(pcm));
    }

    /** @throws {PlaybackError} When the download or the decoding fails. */
    static async fromUrl(url: string, options: UrlSourceOptions = {}): Promise<UrlSource> {
        let pcm: Buffer;

        try {
            const buffer = await fetchAudio(url, options);
            pcm = options.format === 'pcm' ? buffer : await decode(buffer, {signal: options.signal});

            if (pcm.length % (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) !== 0) {
                throw new Error('PCM data does not contain complete stereo frames');
            }
        } catch (err) {
            const error = new PlaybackError(`Failed to decode audio from ${url}: ${err instanceof Error ? err.message : String(err)}`);
            error.cause = err;

            throw error;
        }

        return new UrlSource(pcm);
    }
}
