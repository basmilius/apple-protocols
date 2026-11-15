import type { AnimatedArtwork } from '../types';
import { CatalogError } from './errors';

export type AnimatedArtworkOptions = {
    /** The two-letter storefront code, `us` when omitted. */
    readonly storefront?: string;

    readonly signal?: AbortSignal;
};

/**
 * Reads the animated artwork of an album from the data of its public page. That page carries the
 * same motionDetail formats the Music app uses.
 */
function parseAppleMusicArtwork(html: string, albumId: string): AnimatedArtwork[] {
    const script = html.match(/<script\b[^>]*\bid="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);

    if (!script) {
        throw new CatalogError('invalidResponse', 'Apple Music did not return album page data.');
    }

    const page = JSON.parse(script[1]);
    const results: AnimatedArtwork[] = [];

    for (const entry of page.data ?? []) {
        for (const section of entry.data?.sections ?? []) {
            for (const item of section.items ?? []) {
                const descriptor = item.contentDescriptor;

                if (descriptor?.kind !== 'album' || String(descriptor.identifiers?.storeAdamID) !== albumId) {
                    continue;
                }

                for (const artwork of [item.videoArtwork, item.tallVideoArtwork]) {
                    for (const [format, value] of Object.entries(artwork?.dictionary ?? {})) {
                        const video = (value as {video?: unknown}).video;

                        if (typeof video !== 'string') {
                            continue;
                        }

                        const url = new URL(video);

                        if (url.protocol !== 'https:' || !['apple.com', 'mzstatic.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
                            continue;
                        }

                        if (!results.some(result => result.url === url.href)) {
                            results.push({format, url: url.href, source: 'apple-music'});
                        }
                    }
                }
            }
        }
    }

    return results;
}

/**
 * Looks up the animated artwork of an album on its public Apple Music page. Pass
 * `nowPlaying.current.storeAlbumId`; check that the item did not change before using the result.
 */
export async function fetchAnimatedArtwork(albumId: string, options: AnimatedArtworkOptions = {}): Promise<AnimatedArtwork[]> {
    const storefront = options.storefront ?? 'us';

    if (!/^[1-9]\d*$/.test(albumId) || !/^[a-z]{2}$/.test(storefront)) {
        throw new CatalogError('invalidArgument', 'Apple Music requires a numeric album ID and a two-letter storefront.');
    }

    const timeout = AbortSignal.timeout(10000);
    let response: Response;

    try {
        response = await fetch(`https://music.apple.com/${storefront}/album/${albumId}`, {
            signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
            headers: {accept: 'text/html'}
        });
    } catch (err) {
        const error = new CatalogError('requestFailed', 'Apple Music artwork request failed or timed out.');
        error.cause = err;

        throw error;
    }

    if (!response.ok) {
        throw new CatalogError('requestFailed', `Apple Music artwork request failed (${response.status}).`, response.status);
    }

    const reader = response.body?.getReader();

    if (!reader) {
        throw new CatalogError('invalidResponse', 'Apple Music returned an empty response.');
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
        while (true) {
            const {done, value} = await reader.read();

            if (done) {
                break;
            }

            size += value.byteLength;

            if (size > 2 * 1024 * 1024) {
                throw new CatalogError('tooLarge', 'Apple Music album page exceeds 2 MB.');
            }

            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }

    return parseAppleMusicArtwork(Buffer.concat(chunks).toString('utf8'), albumId);
}
