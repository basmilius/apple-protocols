import type { MediaRemote } from '@corewire/airplay/mrp';
import type { AnimatedArtwork, Artwork } from '../types';

/** Artwork of what plays now, as the device delivers it. Without a session there is none. */
export class ArtworkControl {
    readonly #remote: () => MediaRemote | undefined;

    constructor(remote: () => MediaRemote | undefined) {
        this.#remote = remote;
    }

    /** @param height - -1 keeps the aspect ratio. */
    async get(width: number = 600, height: number = -1): Promise<Artwork | null> {
        return await this.#remote()?.artwork.get(width, height) ?? null;
    }

    async getAnimated(width: number = 600, height: number = -1): Promise<AnimatedArtwork[]> {
        return await this.#remote()?.artwork.getAnimated(width, height) ?? [];
    }
}
