import { EncryptionType, MetadataType } from './types';

/**
 * Converts a volume percentage to dBFS for the RAOP `volume` SET_PARAMETER.
 *
 * @param volume - Volume percentage, from 0 (silent) to 100 (full).
 * @returns Volume in dBFS, from -144 (mute) to 0 (full).
 */
export function pctToDbfs(volume: number): number {
    if (volume <= 0) {
        return -144;
    }

    if (volume >= 100) {
        return 0;
    }

    return 20 * Math.log10(volume / 100);
}

/**
 * Reads the encryption types from the `et` field of the mDNS TXT record.
 */
export function getEncryptionTypes(properties: Map<string, string>): EncryptionType {
    const field = properties.get('et');

    if (!field) {
        return EncryptionType.Unknown;
    }

    let types = EncryptionType.Unknown;

    for (const entry of field.split(',')) {
        const type = parseInt(entry.trim(), 10);

        if (type === 0) {
            types |= EncryptionType.Unencrypted;
        }

        if (type === 1) {
            types |= EncryptionType.MFiSAP;
        }
    }

    return types;
}

/**
 * Reads the metadata types from the `md` field of the mDNS TXT record.
 */
export function getMetadataTypes(properties: Map<string, string>): MetadataType {
    const field = properties.get('md');

    if (!field) {
        return MetadataType.NotSupported;
    }

    let types = MetadataType.NotSupported;

    for (const entry of field.split(',')) {
        const type = parseInt(entry.trim(), 10);

        if (type === 0) {
            types |= MetadataType.Text;
        }

        if (type === 1) {
            types |= MetadataType.Artwork;
        }

        if (type === 2) {
            types |= MetadataType.Progress;
        }
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
    const sampleRate = parseInt(properties.get('sr') ?? '44100', 10);
    const channels = parseInt(properties.get('ch') ?? '2', 10);
    const bitsPerSample = parseInt(properties.get('ss') ?? '16', 10);

    return [sampleRate, channels, bitsPerSample / 8];
}
