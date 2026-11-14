import type { Socket as UdpSocket } from 'node:dgram';

/**
 * Metadata describing the currently streaming media track.
 */
export type MediaMetadata = {
    /** Track title. */
    readonly title: string;
    /** Artist or performer name. */
    readonly artist: string;
    /** Album name. */
    readonly album: string;
    /** Total duration of the track in seconds. */
    readonly duration: number;
    /** Optional album artwork image data (JPEG or PNG). */
    readonly artwork?: Buffer;
}

/**
 * Snapshot of the current playback state, combining metadata
 * with the stream position.
 */
export type PlaybackInfo = {
    /** Metadata for the currently playing track. */
    readonly metadata: MediaMetadata;
    /** Current playback position in audio frames. */
    readonly position: number;
}

/**
 * Mutable state shared across all RAOP streaming components.
 * Holds RTP sequence numbers, timestamps, audio format details,
 * and connection ports negotiated during RTSP SETUP.
 */
export type StreamContext = {
    /** Audio sample rate in Hz (e.g. 44100). */
    sampleRate: number;
    /** Number of audio channels (e.g. 2 for stereo). */
    channels: number;
    /** Bytes per channel sample (e.g. 2 for 16-bit). */
    bytesPerChannel: number;
    /** Current RTP sequence number (wraps at 16 bits). */
    rtpseq: number;
    /** Initial RTP timestamp used in RECORD/FLUSH headers. */
    rtptime: number;
    /** Current head timestamp tracking the latest sent audio frame. */
    headTs: number;
    /** Latency in audio frames (typically 2 seconds worth). */
    latency: number;
    /** Remote server audio data port assigned during SETUP. */
    serverPort: number;
    /** Remote control port for sync and retransmit communication. */
    controlPort: number;
    /** RTSP session identifier string. */
    rtspSession: string;
    /** Current volume level in dBFS. */
    volume: number;
    /** Current playback position in audio frames. */
    position: number;
    /** Size of a single audio packet payload in bytes. */
    packetSize: number;
    /** Size of a single audio frame in bytes (channels * bytesPerChannel). */
    frameSize: number;
    /** Number of silence padding frames sent after source exhaustion. */
    paddingSent: number;

    /**
     * Resets RTP sequence number, timestamp, head timestamp,
     * padding counter, and position for a new stream session.
     */
    reset(): void;
}

/**
 * Abstraction over the transport-level protocol operations for
 * setting up and tearing down an audio stream. Allows different
 * protocol backends (e.g. RAOP over RTSP).
 */
export interface StreamProtocol {
    /**
     * Performs RTSP ANNOUNCE and SETUP, negotiating ports with the receiver.
     *
     * @param timingPort - Local NTP timing server port.
     * @param controlPort - Local control channel port.
     */
    setup(timingPort: number, controlPort: number): Promise<void>;

    /**
     * Starts sending periodic feedback requests to maintain the session.
     */
    startFeedback(): Promise<void>;

    /**
     * Sends a single audio packet over the UDP transport.
     *
     * @param transport - UDP socket connected to the receiver.
     * @param header - RTP header for the audio packet.
     * @param audio - Raw audio payload data.
     * @returns A tuple of [sequence number, full packet buffer] for backlog storage.
     */
    sendAudioPacket(transport: UdpSocket, header: Buffer, audio: Buffer): Promise<[number, Buffer]>;

    /**
     * Tears down the protocol session, stopping feedback and releasing resources.
     */
    teardown(): void;
}

/**
 * Configuration for RAOP protocol port bindings.
 */
export interface Settings {
    /** Protocol-specific port configuration. */
    protocols: {
        /** RAOP control and timing port settings. */
        raop: {
            /** Control channel port (0 for auto-assign). */
            controlPort: number;
            /** NTP timing server port (0 for auto-assign). */
            timingPort: number;
        };
    };
}

/**
 * Bitmask enum for encryption types supported by the RAOP receiver.
 * Values are parsed from the `et` mDNS TXT record field.
 */
export enum EncryptionType {
    /** No encryption information available. */
    Unknown = 0,
    /** Receiver supports unencrypted streams. */
    Unencrypted = 1 << 0,
    /** Receiver supports MFi-SAP encryption (AirPort Express). */
    MFiSAP = 1 << 1
}

/**
 * Bitmask enum for metadata types supported by the RAOP receiver.
 * Values are parsed from the `md` mDNS TXT record field.
 */
export enum MetadataType {
    /** Receiver does not support metadata. */
    NotSupported = 0,
    /** Receiver supports text metadata (title, artist, album). */
    Text = 1 << 0,
    /** Receiver supports album artwork. */
    Artwork = 1 << 1,
    /** Receiver supports progress/duration information. */
    Progress = 1 << 2
}

/**
 * Listener interface for RAOP playback lifecycle events.
 */
export interface RaopListener {
    /**
     * Called when audio playback starts or metadata changes.
     *
     * @param playbackInfo - Current playback state information.
     */
    playing(playbackInfo: PlaybackInfo): void;

    /**
     * Called when audio playback stops.
     */
    stopped(): void;
}
