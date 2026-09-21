import { NSKeyedArchiver, Plist } from '@basmilius/apple-encoding';

/** MRAnimatedArtwork serializes its NSURL with NSKeyedArchiver, not UTF-8. */
export function decodeArtworkAssetURL(data: Uint8Array | undefined): string | null {
    if (!data?.byteLength) {
        return null;
    }

    try {
        const root = NSKeyedArchiver.decode(Plist.parse(Uint8Array.from(data).buffer));
        const resolve = (value: unknown, depth: number = 0): URL | null => {
            if (!value || typeof value !== 'object' || depth > 8) {
                return null;
            }

            const object = value as Record<string, unknown>;
            if (typeof object['NS.relative'] !== 'string') {
                return null;
            }

            const base = resolve(object['NS.base'], depth + 1);
            return new URL(object['NS.relative'], base ?? undefined);
        };

        const url = resolve(root);

        // A file URL belongs to the remote device and must never read a local file.
        return url && (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : null;
    } catch {
        return null;
    }
}
