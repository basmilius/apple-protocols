import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { decode, isMp3 } from './decoder';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source for MP3 data. Decodes MP3 to signed 16-bit big-endian
 * PCM using a WASM-based decoder and serves the resulting buffer.
 */
export default class Mp3 extends BufferAudioSource {
    /**
     * Creates an MP3 audio source from a pre-decoded PCM buffer.
     * Use {@link fromBuffer} or {@link fromUrl} to create instances
     * with automatic decoding.
     *
     * @param buffer - Pre-decoded PCM audio data.
     * @param duration - Total duration of the audio in seconds.
     */
    constructor(buffer: Buffer, duration: number) {
        super(buffer, duration);
    }

    /**
     * Creates an Mp3 audio source from a raw MP3 buffer by decoding
     * it to signed 16-bit big-endian PCM.
     *
     * @param mp3Buffer - Raw MP3 data to decode.
     * @returns A new Mp3 audio source with the decoded PCM data.
     * @throws Error if the buffer does not contain valid MP3 data.
     */
    static async fromBuffer(mp3Buffer: Buffer): Promise<Mp3> {
        if (!isMp3(mp3Buffer)) {
            throw new Error('Invalid MP3 file');
        }

        const pcmBuffer = await decode(mp3Buffer);
        const duration = pcmBuffer.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;

        return new Mp3(pcmBuffer, duration);
    }

    /**
     * Fetches an MP3 file from a URL and decodes it to PCM.
     *
     * @param url - URL pointing to an MP3 file.
     * @returns A new Mp3 audio source with the decoded PCM data.
     * @throws Error if the fetched data is not valid MP3.
     */
    static async fromUrl(url: string): Promise<Mp3> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch audio from ${url}: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        return Mp3.fromBuffer(Buffer.from(arrayBuffer));
    }
}
