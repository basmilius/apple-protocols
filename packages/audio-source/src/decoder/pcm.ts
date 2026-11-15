import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '../const';

/** Converts to 44100 Hz signed 16-bit big-endian stereo PCM using linear interpolation and channel mapping. */
export function convertPcm(input: Buffer, options: ConvertPcmOptions): Buffer {
    const {inputChannels, inputSampleRate, inputBitsPerSample, inputEndian} = options;

    if (!Number.isSafeInteger(inputChannels) || inputChannels < 1 || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0 || ![8, 16, 24, 32].includes(inputBitsPerSample)) {
        throw new RangeError('Invalid PCM input format.');
    }

    const bytesPerSample = inputBitsPerSample / 8;
    const inputFrameSize = inputChannels * bytesPerSample;

    if (input.length % inputFrameSize !== 0) {
        throw new RangeError('PCM input must contain complete frames.');
    }

    const inputFrames = Math.floor(input.length / inputFrameSize);
    const outputFrames = Math.floor(inputFrames * AUDIO_SAMPLE_RATE / inputSampleRate);

    if (!Number.isSafeInteger(outputFrames) || outputFrames * AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL > 256 * 1024 * 1024) {
        throw new RangeError('Converted PCM exceeds the output limit.');
    }

    const output = Buffer.alloc(outputFrames * AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL);

    for (let i = 0; i < outputFrames; i++) {
        const srcPos = (i * inputSampleRate) / AUDIO_SAMPLE_RATE;
        const srcIndex = Math.floor(srcPos);
        const srcFrac = srcPos - srcIndex;

        for (let channel = 0; channel < AUDIO_CHANNELS; channel++) {
            const inputChannel = Math.min(channel, inputChannels - 1);

            const sample1 = readSample(input, srcIndex, inputChannel, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian);
            const sample2 = srcIndex + 1 < inputFrames
                ? readSample(input, srcIndex + 1, inputChannel, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian)
                : sample1;

            const sample = sample1 + (sample2 - sample1) * srcFrac;

            const outputOffset = (i * AUDIO_CHANNELS + channel) * AUDIO_BYTES_PER_CHANNEL;
            output.writeInt16BE(Math.round(Math.max(-32768, Math.min(32767, sample))), outputOffset);
        }
    }

    return output;
}

/**
 * Reads one sample of 8, 16, 24 or 32 bits, in either byte order.
 *
 * @param frameSize - The size of one frame in bytes, all channels together.
 * @returns The sample scaled to the signed 16-bit range; 0 past the end or for another bit depth.
 */
function readSample(buffer: Buffer, frame: number, channel: number, frameSize: number, bytesPerSample: number, bitsPerSample: number, endian: 'little' | 'big'): number {
    const offset = frame * frameSize + channel * bytesPerSample;

    if (offset + bytesPerSample > buffer.length) {
        return 0;
    }

    if (bitsPerSample === 16) {
        return endian === 'little'
            ? buffer.readInt16LE(offset)
            : buffer.readInt16BE(offset);
    }

    if (bitsPerSample === 8) {
        return (buffer[offset] - 128) * 256;
    }

    if (bitsPerSample === 24) {
        let value: number;

        if (endian === 'little') {
            value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
        } else {
            value = (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
        }

        if (value & 0x800000) {
            value |= ~0xFFFFFF;
        }

        return value / 256;
    }

    if (bitsPerSample === 32) {
        const value = endian === 'little'
            ? buffer.readInt32LE(offset)
            : buffer.readInt32BE(offset);

        return value / 65536;
    }

    return 0;
}

/** The format of the PCM to convert. */
type ConvertPcmOptions = {
    readonly inputChannels: number;

    /** The sample rate in Hz. */
    readonly inputSampleRate: number;

    /** The bit depth: 8, 16, 24 or 32. */
    readonly inputBitsPerSample: number;

    readonly inputEndian: 'little' | 'big';
};
