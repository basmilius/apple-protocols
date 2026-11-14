export type AppleMusicLyricsOptions = {
    readonly bearerToken: string;
    readonly musicUserToken: string;
    readonly storefront: string;
    readonly language?: string;
    readonly script?: string;
};

export function extractAppleMusicLyrics(payload: unknown): string | null {
    const data = (payload as {data?: {attributes?: {ttml?: unknown; ttmlLocalizations?: unknown}}[]})?.data;
    if (!Array.isArray(data)) {
        throw new Error('Apple Music returned an invalid lyrics response.');
    }
    for (const item of data) {
        const attributes = item?.attributes;
        for (const text of [attributes?.ttmlLocalizations, attributes?.ttml]) {
            if (typeof text === 'string' && text.trim()) return text;
        }
    }
    return null;
}

/** Private catalog endpoint; credentials are supplied per request and never persisted. */
export async function fetchAppleMusicLyrics(catalogId: string, options: AppleMusicLyricsOptions): Promise<string | null> {
    if (!/^[1-9]\d*$/.test(catalogId) || !/^[a-z]{2}$/.test(options.storefront)) {
        throw new Error('Apple Music requires a numeric song ID and a two-letter storefront.');
    }
    const bearer = options.bearerToken.trim().replace(/^Bearer\s+/i, '');
    const user = options.musicUserToken.trim();
    if (!bearer || !user || /[\r\n]/.test(bearer + user)) {
        throw new Error('Apple Music requires a bearer token and a music user token.');
    }
    const url = new URL(`https://amp-api.music.apple.com/v1/catalog/${options.storefront}/songs/${catalogId}/syllable-lyrics`);
    url.searchParams.set('extend', 'ttmlLocalizations');
    if (options.language) url.searchParams.set('l[lyrics]', options.language);
    if (options.script) url.searchParams.set('l[script]', options.script);

    let response: Response;
    try {
        response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            // Never forward account headers to a redirect target.
            redirect: 'error',
            headers: {authorization: `Bearer ${bearer}`, 'media-user-token': user, origin: 'https://music.apple.com', referer: 'https://music.apple.com/'}
        });
    } catch {
        throw new Error('Apple Music lyrics request failed or timed out.');
    }
    if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) throw new Error('Apple Music rejected the bearer token (401).');
        if (response.status === 403) throw new Error('Apple Music denied lyrics access. Check the account token, subscription and storefront (403).');
        if (response.status === 404) return null;
        throw new Error(`Apple Music lyrics request failed (${response.status}).`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Apple Music returned an empty lyrics response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) throw new Error('Apple Music lyrics response exceeds 2 MB.');
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new Error('Apple Music returned invalid lyrics JSON.');
    }
    return extractAppleMusicLyrics(payload);
}
