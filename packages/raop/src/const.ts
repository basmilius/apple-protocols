import { EncryptionType, type MediaMetadata } from './types';

export const MAX_PACKETS_COMPENSATE = 3;
export const PACKET_BACKLOG_SIZE = 1000;
export const SLOW_WARNING_THRESHOLD = 5;
export const FRAMES_PER_PACKET = 352;

export const MISSING_METADATA: MediaMetadata = {
    title: 'Streaming with apple-raop',
    artist: 'apple-raop',
    album: 'AirPlay',
    duration: 0
};

export const EMPTY_METADATA: MediaMetadata = {
    title: '',
    artist: '',
    album: '',
    duration: 0
};

export const SUPPORTED_ENCRYPTIONS = EncryptionType.Unencrypted | EncryptionType.MFiSAP;
