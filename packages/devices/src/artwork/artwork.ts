import type { MediaRemote } from '@corewire/airplay/mrp';
import { requireSession } from '../errors';
import type { AnimatedArtwork, Artwork } from '../types';

/**
 * Artwork of what plays now, as the device delivers it.
 *
 * @throws {UnavailableError} While AirPlay is down.
 */
export interface ArtworkControl {
    /**
     * @param width - 600 when omitted.
     * @param height - -1 (keep the aspect ratio) when omitted.
     * @returns Null when the current item has no artwork.
     */
    get(width?: number, height?: number): Promise<Artwork | null>;

    /** Empty when the current item has no animated artwork. */
    getAnimated(width?: number, height?: number): Promise<AnimatedArtwork[]>;
}

export class ArtworkController implements ArtworkControl {
    readonly #remote: () => MediaRemote | undefined;

    constructor(remote: () => MediaRemote | undefined) {
        this.#remote = remote;
    }

    async get(width: number = 600, height: number = -1): Promise<Artwork | null> {
        return await requireSession(this.#remote(), 'artwork').artwork.get(width, height) ?? null;
    }

    async getAnimated(width: number = 600, height: number = -1): Promise<AnimatedArtwork[]> {
        return await requireSession(this.#remote(), 'artwork').artwork.getAnimated(width, height) ?? [];
    }
}
