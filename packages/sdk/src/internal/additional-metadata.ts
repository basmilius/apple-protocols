import { NSKeyedArchiver, Plist } from '@basmilius/apple-encoding';

/**
 * Fields from the `TVRAdditionalMetadata` entry of an archived now-playing info dictionary.
 * Empty strings and zeros mean the archive does not carry the field.
 */
export type AdditionalMetadata = {
    readonly seasonNumber: number;
    readonly episodeNumber: number;
    readonly episodeTitle: string;
    readonly genre: string;
    readonly contentRating: string;
};

const cache = new WeakMap<Uint8Array, AdditionalMetadata | null>();

/**
 * Reads `TVRAdditionalMetadata` from `ContentItemMetadata.nowPlayingInfoData`. The Apple TV app
 * sends season, episode, genre and rating only there. Results are cached per data buffer; a
 * buffer that does not decode yields null.
 */
export function decodeAdditionalMetadata(data: Uint8Array | undefined): AdditionalMetadata | null {
    if (!data?.byteLength) {
        return null;
    }

    if (cache.has(data)) {
        return cache.get(data) ?? null;
    }

    const metadata = parse(data);
    cache.set(data, metadata);

    return metadata;
}

function parse(data: Uint8Array): AdditionalMetadata | null {
    try {
        const root = NSKeyedArchiver.decode(Plist.parse(Uint8Array.from(data).buffer));
        const extra = (root as Record<string, unknown> | null)?.['TVRAdditionalMetadata'];

        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
            return null;
        }

        const entries = extra as Record<string, unknown>;

        return {
            seasonNumber: toNumber(entries['avkt/com.apple.avkit.seasonNumber']),
            episodeNumber: toNumber(entries['avkt/com.apple.avkit.episodeNumber']),
            episodeTitle: toText(entries['mdta/com.apple.hls.episode-title']),
            genre: toText(entries['mdta/com.apple.hls.genre']),
            contentRating: toText(entries['mdta/com.apple.hls.rating-display-name'])
        };
    } catch {
        return null;
    }
}

// The Apple TV app archives season and episode numbers as strings.
function toNumber(value: unknown): number {
    const number = typeof value === 'string' ? Number(value) : value;

    return typeof number === 'number' && Number.isInteger(number) && number > 0 ? number : 0;
}

function toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
}
