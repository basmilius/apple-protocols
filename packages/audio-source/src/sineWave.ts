import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source that generates a pure sine wave tone. Useful for
 * testing and diagnostics. The generated signal includes a short
 * fade-in and fade-out envelope (50ms) to avoid click artifacts.
 */
export default class SineWave extends BufferAudioSource {
    /**
     * Creates a sine wave audio source with the specified parameters.
     *
     * @param durationSeconds - Duration of the tone in seconds.
     * @param frequency - Frequency of the sine wave in Hz (default 440 Hz / A4).
     * @param sampleRate - Sample rate in Hz.
     * @param channels - Number of audio channels.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     */
    constructor(durationSeconds: number, frequency: number = 440, sampleRate: number = AUDIO_SAMPLE_RATE, channels: number = AUDIO_CHANNELS, bytesPerChannel: number = AUDIO_BYTES_PER_CHANNEL) {
        const frameSize = channels * bytesPerChannel;
        const buffer = SineWave.#generateSineWave(sampleRate, channels, bytesPerChannel, durationSeconds, frequency);
        super(buffer, durationSeconds, frameSize);
    }

    /**
     * Generates a signed 16-bit big-endian PCM buffer containing a
     * sine wave with a fade-in/fade-out envelope to prevent clicks.
     *
     * @param sampleRate - Sample rate in Hz.
     * @param channels - Number of audio channels.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     * @param durationSeconds - Duration of the tone in seconds.
     * @param frequency - Frequency of the sine wave in Hz.
     * @returns A buffer containing the generated PCM data.
     */
    static #generateSineWave(sampleRate: number, channels: number, bytesPerChannel: number, durationSeconds: number, frequency: number): Buffer {
        const totalSamples = sampleRate * durationSeconds;
        const buffer = Buffer.alloc(totalSamples * channels * bytesPerChannel);

        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let i = 0; i < totalSamples; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate);

            let envelope = 1.0;

            if (i < fadeSamples) {
                envelope = i / fadeSamples;
            } else if (i >= totalSamples - fadeSamples) {
                envelope = (totalSamples - i) / fadeSamples;
            }

            const value = Math.round(sample * envelope * 0x7FFF);

            for (let ch = 0; ch < channels; ch++) {
                const offset = (i * channels + ch) * bytesPerChannel;
                buffer.writeInt16BE(value, offset);
            }
        }

        return buffer;
    }
}
