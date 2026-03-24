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

/** Cardinal direction for swipe gestures on the virtual touchpad. */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
