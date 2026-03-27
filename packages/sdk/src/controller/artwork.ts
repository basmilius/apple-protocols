import type { AirPlayManager, ArtworkResult } from '../internal';

/**
 * Artwork controller for Apple devices.
 * Resolves artwork from all available sources with a 4-tier fallback.
 */
export class ArtworkController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    /**
     * Gets the current artwork for the active now-playing item.
     *
     * @param width - Desired width in pixels (default: 600).
     * @param height - Desired height in pixels (-1 for proportional).
     * @returns Artwork result with url, data, or both.
     */
    async get(width: number = 600, height: number = -1): Promise<ArtworkResult | null> {
        return await this.#airplay.artwork.get(width, height);
    }
}
