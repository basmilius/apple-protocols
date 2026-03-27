import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';

/**
 * Converts PCM audio data from one format to signed 16-bit big-endian
 * stereo at the default sample rate (44100 Hz). Uses linear interpolation
 * for sample rate conversion and channel mapping (mono to stereo or
 * channel clamping).
 *
 * @param input - Source PCM audio data.
 * @param options - Description of the input PCM format.
 * @returns A buffer containing the converted signed 16-bit big-endian stereo PCM.
 */
export function convertPcm(input: Buffer, options: ConvertPcmOptions): Buffer {
    const {inputChannels, inputSampleRate, inputBitsPerSample, inputEndian} = options;
    const bytesPerSample = inputBitsPerSample / 8;
    const inputFrameSize = inputChannels * bytesPerSample;
    const inputFrames = Math.floor(input.length / inputFrameSize);

    const outputFrames = Math.floor(inputFrames * AUDIO_SAMPLE_RATE / inputSampleRate);
    const output = Buffer.alloc(outputFrames * AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL);

    for (let i = 0; i < outputFrames; i++) {
        const srcPos = (i * inputSampleRate) / AUDIO_SAMPLE_RATE;
        const srcIndex = Math.floor(srcPos);
        const srcFrac = srcPos - srcIndex;

        for (let ch = 0; ch < AUDIO_CHANNELS; ch++) {
            const inputCh = Math.min(ch, inputChannels - 1);

            const sample1 = readSample(input, srcIndex, inputCh, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian);
            const sample2 = srcIndex + 1 < inputFrames
                ? readSample(input, srcIndex + 1, inputCh, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian)
                : sample1;

            const sample = sample1 + (sample2 - sample1) * srcFrac;

            const outputOffset = (i * AUDIO_CHANNELS + ch) * AUDIO_BYTES_PER_CHANNEL;
            output.writeInt16BE(Math.round(Math.max(-32768, Math.min(32767, sample))), outputOffset);
        }
    }

    return output;
}

/**
 * Reads a single PCM sample from the buffer and returns it as a
 * signed 16-bit integer value. Supports 8, 16, 24, and 32-bit
 * sample depths in both little-endian and big-endian byte order.
 *
 * @param buffer - Source PCM data buffer.
 * @param frame - Frame index (sample index across all channels).
 * @param channel - Channel index within the frame.
 * @param frameSize - Size of a single frame in bytes (all channels).
 * @param bytesPerSample - Number of bytes per individual sample.
 * @param bitsPerSample - Bit depth of the samples (8, 16, 24, or 32).
 * @param endian - Byte order of the samples.
 * @returns The sample value scaled to signed 16-bit range, or 0 for unsupported bit depths.
 */
function readSample(buffer: Buffer, frame: number, channel: number, frameSize: number, bytesPerSample: number, bitsPerSample: number, endian: 'little' | 'big'): number {
    const offset = frame * frameSize + channel * bytesPerSample;

    if (offset + bytesPerSample > buffer.length) return 0;

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

/**
 * Options describing the format of input PCM data for conversion.
 */
type ConvertPcmOptions = {
    /** Number of audio channels in the input data. */
    readonly inputChannels: number;
    /** Sample rate of the input data in Hz. */
    readonly inputSampleRate: number;
    /** Bit depth of the input samples (8, 16, 24, or 32). */
    readonly inputBitsPerSample: number;
    /** Byte order of the input samples. */
    readonly inputEndian: 'little' | 'big';
};
