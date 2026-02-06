import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from '../const';

export function convertPcm(input: Buffer, options: ConvertPcmOptions): Buffer {
    const {inputChannels, inputSampleRate, inputBitsPerSample, inputEndian} = options;
    const bytesPerSample = inputBitsPerSample / 8;
    const inputFrameSize = inputChannels * bytesPerSample;
    const inputFrames = Math.floor(input.length / inputFrameSize);

    const outputFrames = Math.floor(inputFrames * DEFAULT_SAMPLE_RATE / inputSampleRate);
    const output = Buffer.alloc(outputFrames * DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL);

    for (let i = 0; i < outputFrames; i++) {
        const srcPos = (i * inputSampleRate) / DEFAULT_SAMPLE_RATE;
        const srcIndex = Math.floor(srcPos);
        const srcFrac = srcPos - srcIndex;

        for (let ch = 0; ch < DEFAULT_CHANNELS; ch++) {
            const inputCh = Math.min(ch, inputChannels - 1);

            const sample1 = readSample(input, srcIndex, inputCh, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian);
            const sample2 = srcIndex + 1 < inputFrames
                ? readSample(input, srcIndex + 1, inputCh, inputFrameSize, bytesPerSample, inputBitsPerSample, inputEndian)
                : sample1;

            const sample = sample1 + (sample2 - sample1) * srcFrac;

            const outputOffset = (i * DEFAULT_CHANNELS + ch) * DEFAULT_BYTES_PER_CHANNEL;
            output.writeInt16BE(Math.round(Math.max(-32768, Math.min(32767, sample))), outputOffset);
        }
    }

    return output;
}

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

type ConvertPcmOptions = {
    readonly inputChannels: number;
    readonly inputSampleRate: number;
    readonly inputBitsPerSample: number;
    readonly inputEndian: 'little' | 'big';
};
