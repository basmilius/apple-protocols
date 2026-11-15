import { EncryptionType, type MediaMetadata } from './types';

/** Maximum number of extra packets per cycle when behind real time. */
export const MAX_PACKETS_COMPENSATE = 3;

/** Number of sent packets kept for retransmission. */
export const PACKET_BACKLOG_SIZE = 1000;

/** Number of consecutive slow packets before a warning replaces the debug message. */
export const SLOW_WARNING_THRESHOLD = 5;

/** Metadata for a stream without metadata from the caller. */
export const MISSING_METADATA: MediaMetadata = {
    title: 'Streaming with CoreWire',
    artist: 'CoreWire',
    album: 'AirPlay',
    duration: 0
};

/** Metadata of a stream before any metadata is set. */
export const EMPTY_METADATA: MediaMetadata = {
    title: '',
    artist: '',
    album: '',
    duration: 0
};

/** Encryption types this client supports: unencrypted and MFi-SAP (AirPort Express). */
export const SUPPORTED_ENCRYPTIONS: number = EncryptionType.Unencrypted | EncryptionType.MFiSAP;
