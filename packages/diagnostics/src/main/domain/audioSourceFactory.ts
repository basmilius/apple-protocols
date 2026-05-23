import { File, SineWave, Url } from '@basmilius/apple-audio-source';
import type { AudioSource } from '@basmilius/apple-common';
import { extname } from 'node:path';

export class AudioSourceFactory {
    async fromFile(path: string): Promise<AudioSource> {
        return await File.fromPath(path);
    }

    async fromUrl(url: string): Promise<AudioSource> {
        return await Url.fromUrl(url);
    }

    sineWave(durationSec: number, frequency: number = 440): AudioSource {
        return new SineWave(durationSec, frequency);
    }

    fileExtension(path: string): string {
        return extname(path).toLowerCase();
    }
}
