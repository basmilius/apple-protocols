import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, PlaybackError } from '@basmilius/apple-common';
import { decode, isMp3, isOgg, isWav } from './decoder';
import { BufferAudioSource } from './bufferAudioSource';

/**
 * Audio source that fetches audio from a URL, automatically detecting
 * and decoding MP3, OGG, and WAV formats. Unknown formats are treated
 * as raw PCM data.
 */
export class Url extends BufferAudioSource {
    /**
     * Creates a URL audio source from a pre-decoded PCM buffer.
     * Use {@link fromUrl} to create instances with automatic fetching and decoding.
     *
     * @param buffer - Pre-decoded PCM audio data.
     * @param duration - Total duration of the audio in seconds.
     */
    constructor(buffer: Buffer, duration: number) {
        super(buffer, duration);
    }

    /**
     * Fetches audio from a URL, automatically detecting and decoding
     * MP3, OGG, and WAV formats. Data that does not match any known
     * format is treated as raw PCM.
     *
     * @param url - URL pointing to an audio file.
     * @returns A new Url audio source with the decoded PCM data.
     */
    static async fromUrl(url: string): Promise<Url> {
        let response: Response;

        try {
            response = await fetch(url);
        } catch (err) {
            const error = new PlaybackError(`Failed to fetch audio from ${url}: ${err instanceof Error ? err.message : String(err)}`);
            error.cause = err;
            throw error;
        }

        if (!response.ok) {
            throw new PlaybackError(`Failed to fetch audio from ${url}: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let pcmBuffer: Buffer;

        try {
            pcmBuffer = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
                ? await decode(buffer)
                : buffer;
        } catch (err) {
            const error = new PlaybackError(`Failed to decode audio from ${url}: ${err instanceof Error ? err.message : String(err)}`);
            error.cause = err;
            throw error;
        }

        const duration = pcmBuffer.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;

        return new Url(pcmBuffer, duration);
    }
}
