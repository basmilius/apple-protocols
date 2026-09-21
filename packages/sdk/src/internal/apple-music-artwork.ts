import type { AnimatedArtworkResult } from './airplay-artwork';

/** Public album pages expose the same motionDetail formats used by Music.app. */
export function parseAppleMusicArtwork(html: string, albumId: string): AnimatedArtworkResult[] {
    const script = html.match(/<script\b[^>]*\bid="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
    if (!script) {
        throw new Error('Apple Music did not return album page data.');
    }

    const page = JSON.parse(script[1]);
    const results: AnimatedArtworkResult[] = [];
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

export async function fetchAppleMusicArtwork(albumId: string, storefront: string): Promise<AnimatedArtworkResult[]> {
    if (!/^[1-9]\d*$/.test(albumId) || !/^[a-z]{2}$/.test(storefront)) {
        throw new Error('Apple Music requires a numeric album ID and a two-letter storefront.');
    }

    const response = await fetch(`https://music.apple.com/${storefront}/album/${albumId}`, {
        signal: AbortSignal.timeout(10000),
        headers: {accept: 'text/html'}
    });
    if (!response.ok) {
        throw new Error(`Apple Music artwork request failed (${response.status}).`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Apple Music returned an empty response.');
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) {
                throw new Error('Apple Music album page exceeds 2 MB.');
            }
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }

    return parseAppleMusicArtwork(Buffer.concat(chunks).toString('utf8'), albumId);
}
