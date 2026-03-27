import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source for raw signed 16-bit big-endian PCM data. Serves
 * the provided buffer directly without any decoding or conversion.
 */
export default class Pcm extends BufferAudioSource {
    /**
     * Creates a raw PCM audio source.
     *
     * @param pcmBuffer - Signed 16-bit big-endian interleaved PCM data.
     * @param sampleRate - Sample rate of the PCM data in Hz.
     */
    constructor(pcmBuffer: Buffer, sampleRate: number = AUDIO_SAMPLE_RATE) {
        const frameSize = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
        const duration = pcmBuffer.length / frameSize / sampleRate;
        super(pcmBuffer, duration, frameSize);
    }
}
