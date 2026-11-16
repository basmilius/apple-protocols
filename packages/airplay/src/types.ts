import type { AccessoryCredentials } from '@apple-protocols/core/pairing';
import type { CloseReason, Context, DeviceIdentity } from '@apple-protocols/core/transport';
import type { DataChannel } from './channels/data';
import type { EventChannel } from './channels/event';
import type { PtpMaster, TimingServer } from './timing';

/** Where an AirPlay receiver listens. Only the address is required. */
export type AirPlayTarget = {
    readonly address: string;

    /** RTSP port of the receiver; 7000 when omitted. */
    readonly port?: number;

    /** Tags the logs of every connection to this receiver, usually the mDNS name. Defaults to the address. */
    readonly id?: string;

    /** The TXT record from discovery, when known. */
    readonly txt?: Readonly<Record<string, string>>;

    /** The feature mask from discovery, when known. The session itself reads the one from `/info`. */
    readonly features?: bigint;
};

/** How {@link connect} reaches and authenticates with the receiver. */
export type ConnectOptions = {
    /** Long-term credentials from a PIN pairing, for pair-verify. Without them the session pairs transiently. */
    readonly credentials?: AccessoryCredentials;

    /** Logger and identity to use. Built from {@link AirPlayTarget.id} and {@link identity} when omitted. */
    readonly context?: Context;

    /** Overrides of the identity this client presents; ignored when a context is passed. */
    readonly identity?: DeviceIdentity;

    /** NTP timing server to announce in every SETUP. Without one, SETUP announces no timing. */
    readonly timing?: TimingServer;

    /** Ends the session, or interrupts the handshake, when aborted. */
    readonly signal?: AbortSignal;
};

/** How a PIN pairing is set up. */
export type PairOptions = Pick<ConnectOptions, 'context' | 'identity' | 'signal'>;

/**
 * Why a session ended: this side ended it, or gave up on a setup step (`local`), the receiver
 * dropped it (`remote`), the keepalive went unanswered (`timeout`), or a socket or frame broke (`error`).
 */
export type SessionCloseReason = CloseReason;

/** The two channels of remote control. The session owns them and ends when either one does. */
export type RemoteControlChannels = {
    /** MRP messages. */
    readonly data: DataChannel;

    /** Requests the receiver sends us. */
    readonly events: EventChannel;
};

export type RemoteControlOptions = {
    /**
     * Runs after the data channel exists and before it connects, so a listener misses no message
     * the receiver sends right away, such as DEVICE_INFO.
     */
    subscribe?(data: DataChannel): void;
};

export type PlayUrlOptions = {
    /** Start position in seconds; 0 when omitted. */
    readonly position?: number;

    /** Cancels the setup, or ends the playback, when aborted. */
    readonly signal?: AbortSignal;
};

export type StreamAudioOptions = {
    /** Stream volume in dB, -144 (silent) to 0. A fresh audio session starts silent, so -20 when omitted. */
    readonly volumeDb?: number;

    /**
     * Experimental: a PTP grandmaster for receivers that support PTP. PTP gives silent playback on
     * those receivers, so production streams leave this out and use the NTP timing server.
     */
    readonly ptpMaster?: PtpMaster;

    /** Cancels the setup, or ends the stream, when aborted. */
    readonly signal?: AbortSignal;
};
