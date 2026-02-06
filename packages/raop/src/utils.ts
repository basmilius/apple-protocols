import { EncryptionType, MetadataType } from './types';

export function ts2ntp(timestamp: number, sampleRate: number): bigint {
    const seconds = Math.floor(timestamp / sampleRate);
    const fraction = ((timestamp % sampleRate) * 0xFFFFFFFF) / sampleRate;
    return (BigInt(seconds) << 32n) | BigInt(Math.floor(fraction));
}

export function pctToDbfs(volume: number): number {
    if (volume <= 0) return -144;
    if (volume >= 100) return 0;
    return 20 * Math.log10(volume / 100);
}

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

export function getAudioProperties(properties: Map<string, string>): [number, number, number] {
    const sr = parseInt(properties.get('sr') ?? '44100', 10);
    const ch = parseInt(properties.get('ch') ?? '2', 10);
    const ss = parseInt(properties.get('ss') ?? '16', 10);
    return [sr, ch, ss / 8];
}
