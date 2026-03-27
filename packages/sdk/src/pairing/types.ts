import type { AccessoryCredentials } from '@basmilius/apple-common';

/**
 * Options for the callback-based pair() convenience method.
 */
export type PairingOptions = {
    /** Callback invoked when the device displays a PIN code. Must return the PIN as a string. */
    readonly onPinRequired: () => Promise<string>;
};

/**
 * Result of a successful pairing session.
 */
export type PairingResult = AccessoryCredentials;
