import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from '../const';
import { convertPcm } from './pcm';
import audioDecode from './audioDecode';

export default async function (buffer: Buffer): Promise<Buffer> {
    const audioBuffer = await audioDecode(buffer);

    const numChannels = audioBuffer.numberOfChannels;
    const numFrames = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    const tempBuffer = Buffer.alloc(numFrames * DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL);

    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < DEFAULT_CHANNELS; ch++) {
            const inputCh = Math.min(ch, numChannels - 1);
            const channelData = audioBuffer.getChannelData(inputCh);
            const sample = Math.round(channelData[i] * 32767);
            const clampedSample = Math.max(-32768, Math.min(32767, sample));
            tempBuffer.writeInt16BE(clampedSample, (i * DEFAULT_CHANNELS + ch) * DEFAULT_BYTES_PER_CHANNEL);
        }
    }

    if (sampleRate !== DEFAULT_SAMPLE_RATE) {
        return convertPcm(tempBuffer, {
            inputChannels: DEFAULT_CHANNELS,
            inputSampleRate: sampleRate,
            inputBitsPerSample: 16,
            inputEndian: 'big'
        });
    }

    return tempBuffer;
}
