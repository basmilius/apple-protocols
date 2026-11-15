/**
 * Parses the `features` TXT value of an mDNS record: one hex value, or two comma-separated 32-bit
 * hex values (low,high) that form a 64-bit mask.
 *
 * @throws If the value has neither form.
 */
export function parseFeatures(features: string): bigint {
    const parts = features.split(',').map(part => part.trim());

    if (parts.length === 1) {
        return BigInt(parts[0]);
    }

    if (parts.length === 2) {
        const low = BigInt(parts[0]);
        const high = BigInt(parts[1]);

        return (high << 32n) | low;
    }

    throw new Error(`Invalid features format: ${features}`);
}

/** Decodes Apple's full, little-endian feature vector from /info. */
export function parseReceiverFeatures(info: Record<string, unknown>): bigint {
    if (typeof info.featuresEx === 'string') {
        const value = info.featuresEx;

        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
            throw new TypeError('Invalid base64 featuresEx');
        }

        const bytes = Buffer.from(value, 'base64');

        if (bytes.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
            throw new TypeError('Invalid base64 featuresEx');
        }

        let features = 0n;

        for (let i = bytes.length - 1; i >= 0; i--) {
            features = (features << 8n) | BigInt(bytes[i]);
        }

        return features;
    }

    const legacy = parseLegacyFeatures(info.features ?? 0n);

    // Older versions of this library sent a numeric high word.
    return info.featuresEx == null ? legacy : legacy | (parseLegacyFeatures(info.featuresEx) << 32n);
}

/** Encodes the legacy mask and Apple's base64 extended representation for SETUP. */
export function encodeFeatures(features: bigint): {features: bigint; featuresEx: string} {
    if (features < 0n) {
        throw new RangeError('Features must be non-negative');
    }

    const bytes: number[] = [];

    for (let remaining = features; remaining > 0n; remaining >>= 8n) {
        bytes.push(Number(remaining & 0xffn));
    }

    return {
        features: features & 0xffffffffffffffffn,
        featuresEx: Buffer.from(bytes).toString('base64')
    };
}

function parseLegacyFeatures(value: unknown): bigint {
    if (typeof value === 'bigint' && value >= 0n) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string') {
        if (/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return BigInt(value);
        if (/^[0-9a-f]+$/i.test(value)) return BigInt(`0x${value}`);
    }

    throw new TypeError('Invalid or imprecise legacy features');
}
