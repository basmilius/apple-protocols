import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { decode, isWav } from './decoder';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source for WAV data. Decodes WAV (including WAVE_FORMAT_EXTENSIBLE)
 * to signed 16-bit big-endian PCM and serves the resulting buffer.
 */
export default class Wav extends BufferAudioSource {
    /**
     * Creates a WAV audio source from a pre-decoded PCM buffer.
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
     * Creates a Wav audio source from a raw WAV buffer by decoding
     * it to signed 16-bit big-endian PCM.
     *
     * @param wavBuffer - Raw WAV data to decode.
     * @returns A new Wav audio source with the decoded PCM data.
     * @throws Error if the buffer does not contain valid WAV data.
     */
    static async fromBuffer(wavBuffer: Buffer): Promise<Wav> {
        if (!isWav(wavBuffer)) {
            throw new Error('Invalid WAV file');
        }

        const pcmBuffer = await decode(wavBuffer);
        const duration = pcmBuffer.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;

        return new Wav(pcmBuffer, duration);
    }

    /**
     * Fetches a WAV file from a URL and decodes it to PCM.
     *
     * @param url - URL pointing to a WAV file.
     * @returns A new Wav audio source with the decoded PCM data.
     */
    static async fromUrl(url: string): Promise<Wav> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch audio from ${url}: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Wav.fromBuffer(Buffer.from(arrayBuffer));
    }
}
