import { BufferAudioSource } from './bufferAudioSource';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from './const';
import { convertPcm } from './decoder/pcm';

export type SineWaveSourceOptions = {
    /** Length of the tone in seconds. */
    readonly duration: number;

    /** In Hz; 440 (A4) when omitted. */
    readonly frequency?: number;

    /** Rate the tone is generated at before it is resampled to 44100 Hz; 44100 when omitted. */
    readonly sampleRate?: number;

    /** Channels the tone is generated with before it is mixed to stereo; 2 when omitted. */
    readonly channels?: number;
};

/**
 * Audio source that generates a pure sine wave tone. Useful for
 * testing and diagnostics. The generated signal includes a short
 * fade-in and fade-out envelope (50ms) to avoid click artifacts.
 */
export class SineWaveSource extends BufferAudioSource {
    constructor(options: SineWaveSourceOptions) {
        const durationSeconds = options.duration;
        const frequency = options.frequency ?? 440;
        const sampleRate = options.sampleRate ?? AUDIO_SAMPLE_RATE;
        const channels = options.channels ?? AUDIO_CHANNELS;
        const bytesPerChannel = AUDIO_BYTES_PER_CHANNEL;

        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isSafeInteger(channels) || channels <= 0) {
            throw new RangeError('Invalid sine wave format or duration.');
        }
        let buffer = SineWaveSource.#generateSineWave(sampleRate, channels, bytesPerChannel, durationSeconds, frequency);
        if (sampleRate !== AUDIO_SAMPLE_RATE || channels !== AUDIO_CHANNELS) {
            buffer = convertPcm(buffer, {inputChannels: channels, inputSampleRate: sampleRate, inputBitsPerSample: 16, inputEndian: 'big'});
        }
        super(buffer, durationSeconds, AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL);
    }

    /**
     * Generates a signed 16-bit big-endian PCM buffer containing a
     * sine wave with a fade-in/fade-out envelope to prevent clicks.
     *
     * @param sampleRate - Sample rate in Hz.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     * @param durationSeconds - Duration of the tone in seconds.
     * @param frequency - Frequency of the sine wave in Hz.
     * @returns A buffer containing the generated PCM data.
     */
    static #generateSineWave(sampleRate: number, channels: number, bytesPerChannel: number, durationSeconds: number, frequency: number): Buffer {
        const totalSamples = Math.floor(sampleRate * durationSeconds);
        if (totalSamples * channels * bytesPerChannel > 256 * 1024 * 1024) {
            throw new RangeError('Sine wave exceeds the PCM output limit.');
        }
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
