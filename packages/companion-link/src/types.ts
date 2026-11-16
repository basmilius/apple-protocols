import type { AccessoryCredentials } from '@apple-protocols/core/pairing';
import type { CloseReason, Context, DeviceIdentity } from '@apple-protocols/core/transport';
import type { CompanionLinkState } from './state';

/** Where a Companion Link device listens. The port comes from discovery; it is not fixed. */
export type CompanionLinkTarget = {
    readonly address: string;
    readonly port: number;

    /** Tags the logs of the connection, usually the mDNS name. Defaults to the address. */
    readonly id?: string;

    /** The TXT record from discovery, when known. */
    readonly txt?: Readonly<Record<string, string>>;
};

/** How {@link connect} reaches and authenticates with the device. */
export type ConnectOptions = {
    /** Long-term credentials from a PIN pairing, for pair-verify. The AirPlay credentials of an Apple TV work too. */
    readonly credentials: AccessoryCredentials;

    /** Logger to use. Built from {@link CompanionLinkTarget.id} and {@link identity} when omitted. */
    readonly context?: Context;

    /** Overrides of the identity of the context; ignored when a context is passed. */
    readonly identity?: DeviceIdentity;

    /**
     * The iCloud account (alternate DSID) to announce as active during the startup, as an iOS
     * remote does. Without it the startup sends no `SwitchActiveUserAccountEvent`.
     */
    readonly activeUserAccount?: string;

    /**
     * The state to feed; a new one when omitted. Pass one to keep its listeners across sessions.
     * It is fed as it is: clear it yourself when a new session should start empty.
     */
    readonly state?: CompanionLinkState;

    /** Ends the session right away, or interrupts the handshake, when aborted. */
    readonly signal?: AbortSignal;
};

/** How a PIN pairing is set up. */
export type PairOptions = Pick<ConnectOptions, 'context' | 'identity' | 'signal'>;

/**
 * Why a session ended: this side closed it (`local`), the device did (`remote`), the socket did
 * not open in time (`timeout`), or a socket or frame broke (`error`).
 */
export type SessionCloseReason = CloseReason;

/** Which playback controls the device offers now, from the `_iMC` flags. */
export type MediaCapabilities = {
    readonly play: boolean;
    readonly pause: boolean;
    readonly nextTrack: boolean;
    readonly previousTrack: boolean;
    readonly fastForward: boolean;
    readonly rewind: boolean;
    readonly volume: boolean;
    readonly skipForward: boolean;
    readonly skipBackward: boolean;
};

/** The attention (power) state of the Apple TV. */
export type AttentionState =
    | 'unknown'
    | 'asleep'
    | 'screensaver'
    | 'awake'
    | 'idle';

/** The remote text input (RTI) session on the Apple TV. */
export type TextInputState = {
    /** True while a text field has focus. */
    readonly isActive: boolean;

    readonly documentText: string;

    /** True for a password field. */
    readonly isSecure: boolean;

    /** The keyboard type the field asks for. */
    readonly keyboardType: number;

    readonly autocorrection: boolean;
    readonly autocapitalization: boolean;
};

export type ButtonPressType =
    | 'DoubleTap'
    | 'Hold'
    | 'SingleTap';

export type LaunchableApp = {
    /** The bundle identifier, such as `com.apple.TVMovies`. */
    readonly bundleId: string;

    readonly name: string;
};

export type UserAccount = {
    readonly accountId: string;
    readonly name: string;
};

/** The phases of the `_touchC` event, the 0-based `UITouchPhase` values. */
export const TouchPhase = {
    Began: 0,
    Moved: 1,
    Ended: 2,
    Cancelled: 3,
    Stationary: 4
} as const;
export type TouchPhaseValue = typeof TouchPhase[keyof typeof TouchPhase];

/** The phases of the `_hidT` event. Unlike {@link TouchPhase}, the HID touch stream on the wire is 1-based. */
export const HidTouchPhase = {
    Began: 1,
    Moved: 2,
    Stationary: 3,
    Ended: 4,
    Cancelled: 5
} as const;
export type HidTouchPhaseValue = typeof HidTouchPhase[keyof typeof HidTouchPhase];

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
