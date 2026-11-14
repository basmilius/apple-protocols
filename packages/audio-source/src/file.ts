import { readFile } from 'node:fs/promises';
import { BufferAudioSource } from './bufferAudioSource';
import { durationOf } from './const';
import { decode, isMp3, isOgg, isWav } from './decoder';

/** A file on disk, decoded up front to signed 16-bit big-endian PCM. */
export class FileSource extends BufferAudioSource {
    private constructor(pcm: Buffer) {
        super(pcm, durationOf(pcm));
    }

    /** Loads MP3, OGG or WAV as signed 16-bit big-endian PCM. Unrecognized files are treated as raw PCM. */
    static async fromPath(path: string): Promise<FileSource> {
        const raw = await readFile(path);
        const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

        const pcm = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
            ? await decode(buffer)
            : buffer;

        return new FileSource(pcm);
    }
}
