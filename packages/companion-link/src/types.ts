import type { AccessoryCredentials } from '@corewire/core/pairing';
import type { CloseReason, Context, DeviceIdentity } from '@corewire/core/transport';
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
    readonly identity?: Partial<DeviceIdentity>;

    /**
     * The iCloud account (alternate DSID) to announce as active during the startup, as an iOS
     * remote does. Optional; without it no `SwitchActiveUserAccountEvent` is sent.
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

/** Represents the attention/power state of the Apple TV. */
export type AttentionState =
    | 'unknown'
    | 'asleep'
    | 'screensaver'
    | 'awake'
    | 'idle';

/** Current state of the remote text input (RTI) session on the Apple TV. */
export type TextInputState = {
    /** Whether a text input field is currently focused. */
    readonly isActive: boolean;
    /** The current text content in the focused input field. */
    readonly documentText: string;
    /** Whether the input field is a secure/password field. */
    readonly isSecure: boolean;
    /** The keyboard type requested by the focused input field. */
    readonly keyboardType: number;
    /** Whether autocorrection is enabled for the focused input field. */
    readonly autocorrection: boolean;
    /** Whether autocapitalization is enabled for the focused input field. */
    readonly autocapitalization: boolean;
};

/** Supported button press interaction types for HID commands. */
export type ButtonPressType =
    | 'DoubleTap'
    | 'Hold'
    | 'SingleTap';

/** An app that can be launched on the Apple TV. */
export type LaunchableApp = {
    /** The app's bundle identifier (e.g. `com.apple.TVMovies`). */
    readonly bundleId: string;
    /** The user-visible display name of the app. */
    readonly name: string;
};

/** A user account registered on the Apple TV. */
export type UserAccount = {
    /** The unique identifier of the account. */
    readonly accountId: string;
    /** The display name of the account. */
    readonly name: string;
};

/**
 * Touch event phase identifiers, matching UIKit's UITouchPhase values.
 * Used in touch event messages to indicate the lifecycle stage of a finger contact.
 */
export const TouchPhase = {
    Began: 0,
    Moved: 1,
    Ended: 2,
    Cancelled: 3,
    Stationary: 4
} as const;

/** Numeric value of a touch phase. */
export type TouchPhaseValue = typeof TouchPhase[keyof typeof TouchPhase];

/**
 * Touch phase identifiers for HID touch events (`_hidT`). Unlike {@link TouchPhase} (UIKit's 0-based
 * `UITouchPhase`, used by the `_touchC` event), the HID touch stream observed over the wire is 1-based.
 */
export const HidTouchPhase = {
    Began: 1,
    Moved: 2,
    Stationary: 3,
    Ended: 4,
    Cancelled: 5
} as const;

/** Numeric value of a HID touch phase. */
export type HidTouchPhaseValue = typeof HidTouchPhase[keyof typeof HidTouchPhase];

/** Cardinal direction for swipe gestures on the virtual touchpad. */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
