import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { BufferAudioSource } from './bufferAudioSource';
import { convertPcm } from './decoder/pcm';

/**
 * Raw signed 16-bit big-endian stereo PCM, resampled to 44100 Hz when needed.
 */
export class Pcm extends BufferAudioSource {
    /**
     * Creates a raw PCM audio source.
     *
     * @param pcmBuffer - Signed 16-bit big-endian interleaved PCM data.
     * @param sampleRate - Sample rate of the PCM data in Hz.
     */
    constructor(pcmBuffer: Buffer, sampleRate: number = AUDIO_SAMPLE_RATE) {
        const frameSize = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
        if (!Number.isFinite(sampleRate) || sampleRate <= 0 || pcmBuffer.length % frameSize !== 0) {
            throw new RangeError('PCM requires a positive sample rate and complete stereo frames.');
        }
        const duration = pcmBuffer.length / frameSize / sampleRate;
        if (sampleRate !== AUDIO_SAMPLE_RATE) {
            pcmBuffer = convertPcm(pcmBuffer, {inputChannels: AUDIO_CHANNELS, inputSampleRate: sampleRate, inputBitsPerSample: 16, inputEndian: 'big'});
        }
        super(pcmBuffer, duration, frameSize);
    }
}
