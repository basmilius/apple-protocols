import { readFile } from 'node:fs/promises';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from '@basmilius/apple-common';
import { decode, isMp3, isOgg, isWav } from './decoder';
import BufferAudioSource from './bufferAudioSource';

/**
 * Audio source that reads from a pre-decoded PCM buffer loaded from a file.
 * Supports automatic detection and decoding of MP3, OGG, and WAV formats
 * via the {@link fromPath} factory method.
 */
export default class File extends BufferAudioSource {
    /**
     * Creates a File audio source from a pre-decoded PCM buffer.
     *
     * @param buffer - PCM audio data buffer.
     * @param duration - Total duration of the audio in seconds.
     */
    constructor(buffer: Buffer, duration: number) {
        super(buffer, duration);
    }

    /**
     * Loads an audio file from disk, automatically detecting and decoding
     * MP3, OGG, and WAV formats to signed 16-bit big-endian PCM. Files
     * that don't match any known format are treated as raw PCM.
     *
     * @param filePath - Absolute or relative path to the audio file.
     * @returns A new File audio source with the decoded PCM data.
     */
    static async fromPath(filePath: string): Promise<File> {
        const raw = await readFile(filePath);
        const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

        const pcmBuffer = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
            ? await decode(buffer)
            : buffer;

        const duration = pcmBuffer.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;

        return new File(pcmBuffer, duration);
    }
}
