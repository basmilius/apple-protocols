import { decodeArtworkAssetURL } from './artworkUrl';
import type { PlaybackQueue } from './playbackQueue';
import type { Player } from './player';
import type { MediaRemoteState } from './state';

export type AnimatedArtworkResult = {
    readonly format: string;
    readonly url: string | null;
    readonly source?: 'device' | 'apple-music';
};

/** Artwork of the current item, as a URL or as image bytes; at least one of the two is set. */
export type ArtworkResult = {
    readonly url: string | null;
    readonly data: Uint8Array | null;

    /** For example `image/jpeg` or `image/png`. */
    readonly mimeType: string;

    /** The artwork identifier of the item, for change detection. */
    readonly identifier: string | null;

    /** In pixels; 0 when unknown. */
    readonly width: number;

    /** In pixels; 0 when unknown. */
    readonly height: number;
};

/**
 * The artwork of what plays now, from the sources MRP offers, in this order: a URL from the item
 * metadata, image bytes inside the queue, the JPEG of the last SET_ARTWORK, and finally a queue
 * request when the metadata promises artwork that has not arrived. A result is cached per
 * artwork identifier.
 */
export class Artwork {
    readonly #queue: PlaybackQueue;
    readonly #state: MediaRemoteState;
    #cached: ArtworkResult | null = null;
    #lastIdentifier: string | null = null;

    constructor(state: MediaRemoteState, queue: PlaybackQueue) {
        this.#queue = queue;
        this.#state = state;
    }

    /**
     * @param width - In pixels.
     * @param height - In pixels; -1 keeps the aspect ratio.
     * @returns Null when there is no artwork.
     */
    async get(width: number = 600, height: number = -1): Promise<ArtworkResult | null> {
        const player = this.#state.nowPlayingClient?.activePlayer;

        if (!player) {
            return null;
        }

        const identifier = player.artworkId;

        if (identifier && identifier === this.#lastIdentifier && this.#cached) {
            return this.#cached;
        }

        const available = this.#fromPlayer(player, identifier, width, height);

        if (available) {
            return this.#cache(identifier, available);
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

        // The metadata promises artwork, but neither bytes nor a URL arrived yet.
        if (identifier) {
            try {
                await this.#queue.request(1, width, height < 0 ? 400 : height);

                const fetched = this.#fromPlayer(player, identifier, width, height, true);

                if (fetched) {
                    return this.#cache(identifier, fetched);
                }
            } catch {
                // Without the queue there is no artwork.
            }
        }

        this.clear();

        return null;
    }

    /** Asks for the available animated formats first, then for the asset URLs of those formats. */
    async getAnimated(width: number = 600, height: number = -1): Promise<AnimatedArtworkResult[]> {
        const item = await this.#queue.requestAssets({includeAvailableArtworkFormats: true}, width, height);

        if (!item) {
            return [];
        }

        const formats = item.availableAnimatedArtworkFormats;
        const assets = formats.length > 0
            ? await this.#queue.requestAssets({requestedAnimatedArtworkAssetURLFormats: formats}, width, height)
            : item;

        if (!assets || assets.identifier !== item.identifier) {
            return [];
        }

        return assets.animatedArtworks.map(artwork => ({
            format: artwork.type ?? '',
            url: decodeArtworkAssetURL(artwork.assetFileURLData)
        }));
    }

    /** Forgets the cached result, so the next {@link get} looks again. */
    clear(): void {
        this.#lastIdentifier = null;
        this.#cached = null;
    }

    #cache(identifier: string | null, result: ArtworkResult): ArtworkResult {
        this.#lastIdentifier = identifier;
        this.#cached = result;

        return result;
    }

    /** A URL first and inline bytes second, or bytes first after a queue request delivered them. */
    #fromPlayer(player: Player, identifier: string | null, width: number, height: number, dataFirst: boolean = false): ArtworkResult | null {
        const fromUrl = (): ArtworkResult | null => {
            const url = player.artworkUrl(width, height);

            return url
                ? {url, data: null, mimeType: guessMimeType(url), identifier, width, height: height < 0 ? 0 : height}
                : null;
        };

        const fromData = (): ArtworkResult | null => {
            const data = player.currentItemArtwork;

            return data && data.byteLength > 0
                ? {url: null, data, mimeType: player.currentItemMetadata?.artworkMIMEType || 'image/jpeg', identifier, width: 0, height: 0}
                : null;
        };

        return dataFirst
            ? fromData() ?? fromUrl()
            : fromUrl() ?? fromData();
    }
}

function guessMimeType(url: string): string {
    if (url.includes('.png')) {
        return 'image/png';
    }

    if (url.includes('.webp')) {
        return 'image/webp';
    }

    return 'image/jpeg';
}
