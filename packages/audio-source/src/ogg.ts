import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { decode, isOgg } from './decoder';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source for OGG Vorbis data. Decodes OGG to signed 16-bit
 * big-endian PCM using a WASM-based decoder and serves the resulting buffer.
 */
export default class Ogg extends BufferAudioSource {
    /**
     * Creates an OGG audio source from a pre-decoded PCM buffer.
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
     * Creates an Ogg audio source from a raw OGG Vorbis buffer by
     * decoding it to signed 16-bit big-endian PCM.
     *
     * @param oggBuffer - Raw OGG Vorbis data to decode.
     * @returns A new Ogg audio source with the decoded PCM data.
     * @throws Error if the buffer does not contain valid OGG data.
     */
    static async fromBuffer(oggBuffer: Buffer): Promise<Ogg> {
        if (!isOgg(oggBuffer)) {
            throw new Error('Invalid OGG file');
        }

        const pcmBuffer = await decode(oggBuffer);
        const duration = pcmBuffer.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;

        return new Ogg(pcmBuffer, duration);
    }

    /**
     * Fetches an OGG file from a URL and decodes it to PCM.
     *
     * @param url - URL pointing to an OGG Vorbis file.
     * @returns A new Ogg audio source with the decoded PCM data.
     * @throws Error if the fetched data is not valid OGG.
     */
    static async fromUrl(url: string): Promise<Ogg> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch audio from ${url}: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        return Ogg.fromBuffer(Buffer.from(arrayBuffer));
    }
}
