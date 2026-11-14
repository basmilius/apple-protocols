import { BufferAudioSource } from './bufferAudioSource';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from './const';
import { convertPcm } from './decoder/pcm';

export type PcmSourceOptions = {
    /** Sample rate of the PCM in Hz; 44100 when omitted. Other rates are resampled. */
    readonly sampleRate?: number;
};

/** Raw signed 16-bit big-endian stereo PCM, resampled to 44100 Hz when needed. */
export class PcmSource extends BufferAudioSource {
    constructor(pcm: Buffer, options: PcmSourceOptions = {}) {
        const sampleRate = options.sampleRate ?? AUDIO_SAMPLE_RATE;
        const frameSize = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
        if (!Number.isFinite(sampleRate) || sampleRate <= 0 || pcm.length % frameSize !== 0) {
            throw new RangeError('PCM requires a positive sample rate and complete stereo frames.');
        }
        const duration = pcm.length / frameSize / sampleRate;
        if (sampleRate !== AUDIO_SAMPLE_RATE) {
            pcm = convertPcm(pcm, {inputChannels: AUDIO_CHANNELS, inputSampleRate: sampleRate, inputBitsPerSample: 16, inputEndian: 'big'});
        }
        super(pcm, duration, frameSize);
    }
}
