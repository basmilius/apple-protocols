import { EncryptionType, MetadataType } from './types';

/**
 * Converts a volume percentage to dBFS for the RAOP `volume` SET_PARAMETER.
 *
 * @param volume - 0 (silent) to 100 (full).
 * @returns -144 for mute up to 0 for full volume.
 */
export function pctToDbfs(volume: number): number {
    if (volume <= 0) return -144;
    if (volume >= 100) return 0;

    return 20 * Math.log10(volume / 100);
}

/**
 * Reads the encryption types from the `et` field of the mDNS TXT record.
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
 * Reads the metadata types from the `md` field of the mDNS TXT record.
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
 * Reads the audio format from the mDNS TXT record, with CD quality
 * (44100 Hz, 2 channels, 16-bit) for missing fields.
 *
 * @returns `[sampleRate, channels, bytesPerChannel]`.
 */
export function getAudioProperties(properties: Map<string, string>): [number, number, number] {
    const sr = parseInt(properties.get('sr') ?? '44100', 10);
    const ch = parseInt(properties.get('ch') ?? '2', 10);
    const ss = parseInt(properties.get('ss') ?? '16', 10);

    return [sr, ch, ss / 8];
}
