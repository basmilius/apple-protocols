import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from '../const';
import { convertPcm } from './pcm';
import audioDecode from 'audio-decode';

/**
 * Decode an audio buffer to PCM format.
 * Note: This function allocates a full buffer for the entire audio file in memory.
 * For large audio files (>100MB), this may cause memory spikes. Consider using
 * streaming audio sources (like FFmpeg) for better memory efficiency.
 */
export default async function (buffer: Buffer): Promise<Buffer> {
    const audioBuffer = await audioDecode(buffer);

    const numChannels = audioBuffer.numberOfChannels;
    const numFrames = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    // Pre-allocate buffer for entire audio file
    // Memory usage: numFrames * 2 channels * 2 bytes = numFrames * 4 bytes
    // Example: 5 minutes at 44.1kHz = 13,230,000 frames * 4 = ~52MB
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
