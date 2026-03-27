import { DataStreamMessage, type Protocol } from '@basmilius/apple-airplay';
import { PROTOCOL } from './const';
import type Device from './device';
import type State from './state';

/**
 * Artwork result from the unified artwork API.
 * Always contains at least one of `url` or `data`.
 */
export type ArtworkResult = {
    /** Direct URL to the artwork image (preferred for web/UI rendering). */
    readonly url: string | null;
    /** Raw image bytes (available when artwork is embedded or fetched from playback queue). */
    readonly data: Uint8Array | null;
    /** MIME type of the artwork (e.g. 'image/jpeg', 'image/png'). */
    readonly mimeType: string;
    /** The artwork identifier used for change detection. */
    readonly identifier: string | null;
    /** Width of the artwork in pixels (0 if unknown). */
    readonly width: number;
    /** Height of the artwork in pixels (0 if unknown). */
    readonly height: number;
};

/**
 * Unified artwork controller for an AirPlay device.
 *
 * Provides a single `get()` method that resolves artwork from all available
 * sources in priority order:
 * 1. URL from now-playing metadata (artworkURL, remoteArtworks, template)
 * 2. Inline binary data from the playback queue (artworkData, dataArtworks)
 * 3. JPEG data from SET_ARTWORK_MESSAGE
 * 4. Fetches the playback queue if artwork is expected but not yet available
 */
export default class Artwork {
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    get #state(): State {
        return this.#device.state;
    }

    readonly #device: Device;
    #lastIdentifier: string | null = null;
    #cached: ArtworkResult | null = null;

    constructor(device: Device) {
        this.#device = device;
    }

    /**
     * Gets the current artwork for the active now-playing item.
     *
     * Tries all available sources in priority order and returns a unified result.
     * Results are cached by artwork identifier — subsequent calls for the same
     * track return the cached result without additional requests.
     *
     * @param width - Desired artwork width in pixels (default: 600).
     * @param height - Desired artwork height in pixels (-1 for proportional).
     * @returns The artwork result, or null if no artwork is available.
     */
    async get(width: number = 600, height: number = -1): Promise<ArtworkResult | null> {
        const client = this.#state.nowPlayingClient;
        const player = client?.activePlayer;

        if (!player) {
            return null;
        }

        const identifier = player.artworkId;

        // Return cached result if the artwork hasn't changed.
        if (identifier && identifier === this.#lastIdentifier && this.#cached) {
            return this.#cached;
        }

        // Priority 1: URL from player metadata.
        const url = player.artworkUrl(width, height);

        if (url) {
            return this.#cache(identifier, {
                url,
                data: null,
                mimeType: guessMimeType(url),
                identifier,
                width,
                height: height < 0 ? 0 : height
            });
        }

        // Priority 2: Inline binary data from playback queue content item.
        const inlineData = player.currentItemArtwork;

        if (inlineData && inlineData.byteLength > 0) {
            const metadata = player.currentItemMetadata;

            return this.#cache(identifier, {
                url: null,
                data: inlineData,
                mimeType: metadata?.artworkMIMEType || 'image/jpeg',
                identifier,
                width: 0,
                height: 0
            });
        }

        // Priority 3: JPEG data from SET_ARTWORK_MESSAGE.
        const setArtworkData = this.#state.artworkJpegData;

        if (setArtworkData && setArtworkData.byteLength > 0) {
            return this.#cache(identifier, {
                url: null,
                data: setArtworkData,
                mimeType: 'image/jpeg',
                identifier,
                width: 0,
                height: 0
            });
        }

        // Priority 4: Artwork should exist but isn't available yet — request playback queue.
        if (identifier) {
            try {
                await this.#protocol.dataStream.exchange(
                    DataStreamMessage.playbackQueueRequest(0, 1, width, height < 0 ? 400 : height)
                );

                // Retry inline data after queue fetch.
                const fetchedData = player.currentItemArtwork;

                if (fetchedData && fetchedData.byteLength > 0) {
                    const metadata = player.currentItemMetadata;

                    return this.#cache(identifier, {
                        url: null,
                        data: fetchedData,
                        mimeType: metadata?.artworkMIMEType || 'image/jpeg',
                        identifier,
                        width: 0,
                        height: 0
                    });
                }

                // Retry URL after queue fetch (remoteArtworks might now be populated).
                const retryUrl = player.artworkUrl(width, height);

                if (retryUrl) {
                    return this.#cache(identifier, {
                        url: retryUrl,
                        data: null,
                        mimeType: guessMimeType(retryUrl),
                        identifier,
                        width,
                        height: height < 0 ? 0 : height
                    });
                }
            } catch {
                // Queue fetch failed — no artwork available.
            }
        }

        this.#lastIdentifier = null;
        this.#cached = null;

        return null;
    }

    /** Clears the cached artwork, forcing a fresh fetch on the next `get()` call. */
    clear(): void {
        this.#lastIdentifier = null;
        this.#cached = null;
    }

    #cache(identifier: string | null, result: ArtworkResult): ArtworkResult {
        this.#lastIdentifier = identifier;
        this.#cached = result;

        return result;
    }
}

const guessMimeType = (url: string): string => {
    if (url.includes('.png')) {
        return 'image/png';
    }
    if (url.includes('.webp')) {
        return 'image/webp';
    }

    return 'image/jpeg';
};
