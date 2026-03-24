import { EncryptionType, MetadataType } from './types';

/**
 * Converts a linear volume percentage (0-100) to a dBFS value
 * suitable for the RAOP `volume` SET_PARAMETER command.
 *
 * @param volume - Volume as a percentage (0 = silent, 100 = full).
 * @returns Volume in dBFS (-144 for mute, 0 for full volume).
 */
export function pctToDbfs(volume: number): number {
    if (volume <= 0) return -144;
    if (volume >= 100) return 0;
    return 20 * Math.log10(volume / 100);
}

/**
 * Parses the `et` (encryption types) field from mDNS TXT record
 * properties into an EncryptionType bitmask.
 *
 * @param properties - mDNS TXT record key-value pairs.
 * @returns Bitmask of supported encryption types.
 */
export function getEncryptionTypes(properties: Map<string, string>): EncryptionType {
    const et = properties.get('et');
    if (!et) return EncryptionType.Unknown;

    let types = EncryptionType.Unknown;
    for (const t of et.split(',')) {
        const num = parseInt(t.trim(), 10);
        if (num === 0) types |= EncryptionType.Unencrypted;
        if (num === 1) types |= EncryptionType.MFiSAP;
    }
    return types;
}

/**
 * Parses the `md` (metadata types) field from mDNS TXT record
 * properties into a MetadataType bitmask.
 *
 * @param properties - mDNS TXT record key-value pairs.
 * @returns Bitmask of supported metadata types.
 */
export function getMetadataTypes(properties: Map<string, string>): MetadataType {
    const md = properties.get('md');
    if (!md) return MetadataType.NotSupported;

    let types = MetadataType.NotSupported;
    for (const t of md.split(',')) {
        const num = parseInt(t.trim(), 10);
        if (num === 0) types |= MetadataType.Text;
        if (num === 1) types |= MetadataType.Artwork;
        if (num === 2) types |= MetadataType.Progress;
    }
    return types;
}

/**
 * Extracts audio format properties from mDNS TXT record fields.
 * Falls back to CD-quality defaults (44100 Hz, 2 channels, 16-bit)
 * when properties are missing.
 *
 * @param properties - mDNS TXT record key-value pairs.
 * @returns A tuple of [sampleRate, channels, bytesPerChannel].
 */
export function getAudioProperties(properties: Map<string, string>): [number, number, number] {
    const sr = parseInt(properties.get('sr') ?? '44100', 10);
    const ch = parseInt(properties.get('ch') ?? '2', 10);
    const ss = parseInt(properties.get('ss') ?? '16', 10);
    return [sr, ch, ss / 8];
}
