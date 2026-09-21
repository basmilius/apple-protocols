import { DataStreamMessage, type Protocol } from '@basmilius/apple-airplay';
import type { AirPlayManager } from './airplay-manager';
import type { AirPlayState } from './airplay-state';
import { PROTOCOL } from './const';
import { decodeArtworkAssetURL } from './artwork-url';
import { fetchAppleMusicArtwork } from './apple-music-artwork';

export type AnimatedArtworkResult = {
    readonly format: string;
    readonly url: string | null;
    readonly source?: 'device' | 'apple-music';
};

/**
 * Artwork result from the unified artwork API.
 * Always contains at least one of `url` or `data`.
 */
export type ArtworkResult = {
    /**
     * Direct URL to the artwork image (preferred for web/UI rendering).
     */
    readonly url: string | null;

    /**
     * Raw image bytes (available when artwork is embedded or fetched from playback queue).
     */
    readonly data: Uint8Array | null;

    /**
     * MIME type of the artwork (e.g. 'image/jpeg', 'image/png').
     */
    readonly mimeType: string;

    /**
     * The artwork identifier used for change detection.
     */
    readonly identifier: string | null;

    /**
     * Width of the artwork in pixels (0 if unknown).
     */
    readonly width: number;

    /**
     * Height of the artwork in pixels (0 if unknown).
     */
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
export class AirPlayArtwork {
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    get #state(): AirPlayState {
        return this.#device.state;
    }

    readonly #device: AirPlayManager;
    #lastIdentifier: string | null = null;
    #cached: ArtworkResult | null = null;

    constructor(device: AirPlayManager) {
        this.#device = device;
    }

    /** Discovers formats first, then requests the archived asset URLs for those formats. */
    async getAnimated(width: number = 600, height: number = -1): Promise<AnimatedArtworkResult[]> {
        const item = await this.#device.requestContentItemAssets({includeAvailableArtworkFormats: true}, width, height);
        if (!item) {
            return [];
        }

        const formats = item.availableAnimatedArtworkFormats;
        const assets = formats.length > 0
            ? await this.#device.requestContentItemAssets({requestedAnimatedArtworkAssetURLFormats: formats}, width, height)
            : item;

        if (!assets || assets.identifier !== item.identifier) {
            return [];
        }

        return assets.animatedArtworks.map(artwork => ({
            format: artwork.type ?? '',
            url: decodeArtworkAssetURL(artwork.assetFileURLData)
        }));
    }

    /** Opt-in catalog lookup; unlike getAnimated(), this contacts music.apple.com. */
    async getAnimatedFromCatalog(storefront: string = 'us'): Promise<AnimatedArtworkResult[]> {
        const player = this.#state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;
        const albumId = player?.currentItemMetadata?.iTunesStoreAlbumIdentifier;
        if (!identifier || !albumId) {
            return [];
        }

        const results = await fetchAppleMusicArtwork(albumId.toString(), storefront);
        return this.#state.nowPlayingClient?.activePlayer === player && player.currentItem?.identifier === identifier ? results : [];
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

        if (identifier && identifier === this.#lastIdentifier && this.#cached) {
            return this.#cached;
        }

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

        /* Fetch the queue when metadata indicates artwork exists but no bytes or URL are available. */
        if (identifier) {
            try {
                await this.#protocol.dataStream.exchange(
                    DataStreamMessage.playbackQueueRequest(0, 1, width, height < 0 ? 400 : height)
                );

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
                /* Artwork is unavailable when the queue fetch fails. */
            }
        }

        this.#lastIdentifier = null;
        this.#cached = null;

        return null;
    }

    /**
     * Clears the cached artwork, forcing a fresh fetch on the next `get()` call.
     */
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
