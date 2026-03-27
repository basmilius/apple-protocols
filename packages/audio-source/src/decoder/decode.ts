import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { convertPcm } from './pcm';
import audioDecode from './audioDecode';

/**
 * Decodes an encoded audio buffer (MP3, OGG, WAV, FLAC, QOA) into
 * signed 16-bit big-endian stereo PCM at the default sample rate.
 * If the decoded audio has a different sample rate, it is resampled
 * using linear interpolation.
 *
 * @param buffer - Encoded audio data to decode.
 * @returns A buffer containing signed 16-bit big-endian interleaved stereo PCM.
 */
export default async function (buffer: Buffer): Promise<Buffer> {
    const audioBuffer = await audioDecode(buffer);

    const numChannels = audioBuffer.numberOfChannels;
    const numFrames = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    const tempBuffer = Buffer.alloc(numFrames * AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL);

    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < AUDIO_CHANNELS; ch++) {
            const inputCh = Math.min(ch, numChannels - 1);
            const channelData = audioBuffer.getChannelData(inputCh);
            const sample = Math.round(channelData[i] * 32767);
            const clampedSample = Math.max(-32768, Math.min(32767, sample));
            tempBuffer.writeInt16BE(clampedSample, (i * AUDIO_CHANNELS + ch) * AUDIO_BYTES_PER_CHANNEL);
        }
    }

    if (sampleRate !== AUDIO_SAMPLE_RATE) {
        return convertPcm(tempBuffer, {
            inputChannels: AUDIO_CHANNELS,
            inputSampleRate: sampleRate,
            inputBitsPerSample: 16,
            inputEndian: 'big'
        });
    }

    return tempBuffer;
}
