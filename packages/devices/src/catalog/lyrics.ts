import { readBody } from './body';
import { CatalogError } from './errors';

export type AppleMusicLyricsOptions = {
    readonly bearerToken: string;
    readonly musicUserToken: string;
    readonly storefront: string;
    readonly language?: string;
    readonly script?: string;
    readonly signal?: AbortSignal;
};

function extractAppleMusicLyrics(payload: unknown): string | null {
    const data = (payload as {data?: {attributes?: {ttml?: unknown; ttmlLocalizations?: unknown}}[]})?.data;

    if (!Array.isArray(data)) {
        throw new CatalogError('invalidResponse', 'Apple Music returned an invalid lyrics response.');
    }

    for (const item of data) {
        const attributes = item?.attributes;

        for (const text of [attributes?.ttmlLocalizations, attributes?.ttml]) {
            if (typeof text === 'string' && text.trim()) {
                return text;
            }
        }
    }

    return null;
}

/**
 * Fetches the TTML lyrics of a song from the Apple Music catalog. Pass `nowPlaying.current.lyricsId`.
 * The endpoint is private. The caller passes the tokens per request and nothing stores them.
 */
export async function fetchLyrics(catalogId: string, options: AppleMusicLyricsOptions): Promise<string | null> {
    if (!/^[1-9]\d*$/.test(catalogId) || !/^[a-z]{2}$/.test(options.storefront)) {
        throw new CatalogError('invalidArgument', 'Apple Music requires a numeric song ID and a two-letter storefront.');
    }

    const bearer = options.bearerToken.trim().replace(/^Bearer\s+/i, '');
    const user = options.musicUserToken.trim();

    if (!bearer || !user || /[\r\n]/.test(bearer + user)) {
        throw new CatalogError('invalidArgument', 'Apple Music requires a bearer token and a music user token.');
    }

    const url = new URL(`https://amp-api.music.apple.com/v1/catalog/${options.storefront}/songs/${catalogId}/syllable-lyrics`);
    url.searchParams.set('extend', 'ttmlLocalizations');

    if (options.language) {
        url.searchParams.set('l[lyrics]', options.language);
    }

    if (options.script) {
        url.searchParams.set('l[script]', options.script);
    }

    let response: Response;

    try {
        response = await fetch(url, {
            signal: options.signal ? AbortSignal.any([AbortSignal.timeout(15000), options.signal]) : AbortSignal.timeout(15000),
            // Never forward account headers to a redirect target.
            redirect: 'error',
            headers: {authorization: `Bearer ${bearer}`, 'media-user-token': user, origin: 'https://music.apple.com', referer: 'https://music.apple.com/'}
        });
    } catch {
        throw new CatalogError('requestFailed', 'Apple Music lyrics request failed or timed out.');
    }

    if (!response.ok) {
        await response.body?.cancel();

        if (response.status === 401) {
            throw new CatalogError('unauthorized', 'Apple Music rejected the bearer token (401).', 401);
        }

        if (response.status === 403) {
            throw new CatalogError('forbidden', 'Apple Music denied lyrics access. Check the account token, subscription and storefront (403).', 403);
        }

        if (response.status === 404) {
            return null;
        }

        throw new CatalogError('requestFailed', `Apple Music lyrics request failed (${response.status}).`, response.status);
    }

    const body = await readBody(response, 'lyrics response');
    let payload: unknown;

    try {
        payload = JSON.parse(body);
    } catch {
        throw new CatalogError('invalidResponse', 'Apple Music returned invalid lyrics JSON.');
    }

    return extractAppleMusicLyrics(payload);
}
