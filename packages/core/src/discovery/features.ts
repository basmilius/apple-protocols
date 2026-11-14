/**
 * Parses an AirPlay features string into a single bigint bitmask.
 * Features are advertised as either a single hex value or two comma-separated
 * 32-bit hex values (low,high) which are combined into a 64-bit bitmask.
 *
 * @param features - The features string from the mDNS TXT record.
 * @returns The combined feature flags as a bigint.
 * @throws If the features string has an unexpected format.
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
