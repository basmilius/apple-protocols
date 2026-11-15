import type { Socket as UdpSocket } from 'node:dgram';
import type { CloseReason, Context } from '@corewire/core/transport';
import type { TimingServer } from '../timing';

/** Where a RAOP receiver is. */
export type RaopTarget = {
    readonly address: string;

    /** RTSP port of the RAOP service; 7000 when omitted. */
    readonly port?: number;

    /** Tags the logs, usually the mDNS name. Defaults to the address. */
    readonly id?: string;

    /** The RAOP TXT record; the encryption, metadata and audio properties come from it. */
    readonly txt?: Readonly<Record<string, string>>;
};

/** The track a stream shows on the receiver. */
export type MediaMetadata = {
    readonly title: string;
    readonly artist: string;
    readonly album: string;

    /** Duration in seconds. */
    readonly duration: number;

    /** Album artwork as JPEG or PNG. */
    readonly artwork?: Buffer;
}

export type RaopPlaybackInfo = {
    readonly metadata: MediaMetadata;

    /** Playback position in audio frames. */
    readonly position: number;
}

/**
 * State shared by the RAOP streaming parts and updated in place: RTP state,
 * audio format and the ports from RTSP SETUP.
 */
export type StreamContext = {
    /** Sample rate in Hz. */
    sampleRate: number;

    channels: number;

    /** Bytes per sample per channel. */
    bytesPerChannel: number;

    /** RTP sequence number, wraps at 16 bits. */
    rtpseq: number;

    /** Initial RTP timestamp for the RECORD and FLUSH headers. */
    rtptime: number;

    /** Timestamp of the latest frame sent. */
    headTs: number;

    /** Latency in audio frames, usually 2 seconds. */
    latency: number;

    /** Receiver audio data port from SETUP. */
    serverPort: number;

    /** Receiver control port for sync and retransmits. */
    controlPort: number;

    rtspSession: string;

    /** Volume in dBFS. */
    volume: number;

    /** Playback position in audio frames. */
    position: number;

    /** Bytes per audio packet payload. */
    packetSize: number;

    /** Bytes per frame: channels * bytesPerChannel. */
    frameSize: number;

    /** Silence frames sent after the source ran out. */
    paddingSent: number;

    /** Resets the RTP state, the padding counter and the position for a new stream. */
    reset(): void;
}

/** The protocol steps to set up, feed and tear down an audio stream. */
export interface StreamProtocol {
    /**
     * Sends RTSP ANNOUNCE and SETUP to negotiate the ports.
     *
     * @param timingPort - Local NTP timing server port.
     * @param controlPort - Local control channel port.
     */
    setup(timingPort: number, controlPort: number): Promise<void>;

    /** Starts the periodic feedback requests that keep the session alive. */
    startFeedback(): Promise<void>;

    /**
     * Sends one audio packet.
     *
     * @returns The sequence number and the full packet, for the backlog.
     */
    sendAudioPacket(transport: UdpSocket, header: Buffer, audio: Buffer): Promise<[number, Buffer]>;

    /** Stops the feedback and releases the session. */
    teardown(): void;
}

/** Local RAOP port bindings. */
export interface Settings {
    protocols: {
        raop: {
            /** Control channel port; 0 picks a free one. */
            controlPort: number;

            /** NTP timing server port; 0 picks a free one. */
            timingPort: number;
        };
    };
}

/** Encryption types a RAOP receiver supports, from the `et` TXT field. */
export enum EncryptionType {
    /** The TXT record has no encryption field. */
    Unknown = 0,
    Unencrypted = 1 << 0,

    /** The receiver supports MFi-SAP encryption, as the AirPort Express does. */
    MFiSAP = 1 << 1
}

/** Metadata types a RAOP receiver supports, from the `md` TXT field. */
export enum MetadataType {
    NotSupported = 0,

    /** The receiver shows title, artist and album. */
    Text = 1 << 0,

    Artwork = 1 << 1,

    /** The receiver shows progress and duration. */
    Progress = 1 << 2
}

/** How {@link connect} reaches the receiver and what a stream shows by default. */
export type RaopConnectOptions = {
    /** NTP timing server the receiver synchronizes with; SETUP announces its port. */
    readonly timing: TimingServer;

    /** Logger to use. Built from {@link RaopTarget.id} when omitted. */
    readonly context?: Context;

    /** Shown on the receiver while a stream comes without metadata. Title `Streaming with CoreWire`, artist `CoreWire` and album `AirPlay` when omitted. */
    readonly metadata?: Partial<Pick<MediaMetadata, 'title' | 'artist' | 'album'>>;

    /** Answers a digest challenge on ANNOUNCE from a receiver with a password. */
    readonly password?: string;

    /** Ends the session, or interrupts the handshake, when aborted. */
    readonly signal?: AbortSignal;
};

export type RaopStreamOptions = {
    /** Track metadata to show on the receiver; the defaults of {@link RaopConnectOptions.metadata} when omitted. */
    readonly metadata?: MediaMetadata;

    /** Volume in dBFS, -144 (silent) to 0, sent after FLUSH. The receiver keeps its own when omitted. */
    readonly volumeDb?: number;
};

/** A running RAOP stream. */
export type RaopPlayback = {
    /**
     * Settles when streaming is over: resolves once the source ran out and TEARDOWN went out,
     * rejects when the stream failed.
     */
    readonly ended: Promise<void>;

    /** Stops the source; the stream winds down and sends TEARDOWN. */
    stop(): void;
};

export type RaopEventMap = {
    /** The session ended, see {@link CloseReason}. */
    closed: [reason: CloseReason, error?: Error];

    /** A stream started, with the metadata it shows. */
    playing: [playbackInfo: RaopPlaybackInfo];

    /** A stream ended. */
    stopped: [];
};
