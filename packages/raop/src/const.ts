import { EncryptionType, type MediaMetadata } from './types';

/**
 * Maximum number of extra packets to send when compensating for
 * falling behind real-time playback.
 */
export const MAX_PACKETS_COMPENSATE = 3;

/**
 * Number of recently sent packets to keep in the FIFO backlog
 * for retransmission upon receiver request.
 */
export const PACKET_BACKLOG_SIZE = 1000;

/**
 * Number of consecutive slow sequence numbers before a warning
 * is logged instead of a debug message.
 */
export const SLOW_WARNING_THRESHOLD = 5;

/**
 * Fallback metadata used when the caller does not provide any
 * media metadata for the audio stream.
 */
export const MISSING_METADATA: MediaMetadata = {
    title: 'Streaming with apple-raop',
    artist: 'apple-raop',
    album: 'AirPlay',
    duration: 0
};

/**
 * Empty metadata sentinel used as the default value before any
 * metadata has been set on a stream.
 */
export const EMPTY_METADATA: MediaMetadata = {
    title: '',
    artist: '',
    album: '',
    duration: 0
};

/**
 * Bitmask of encryption types this client supports.
 * Currently supports unencrypted and MFi-SAP (AirPort Express) encryption.
 */
export const SUPPORTED_ENCRYPTIONS: number = EncryptionType.Unencrypted | EncryptionType.MFiSAP;
