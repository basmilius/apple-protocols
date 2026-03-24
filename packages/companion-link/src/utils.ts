import type { AttentionState } from './types';

/**
 * Converts a numeric attention state value from the Apple TV into
 * its corresponding string representation.
 *
 * @param state - The numeric attention state received from the device.
 * @returns The human-readable attention state string.
 */
export function convertAttentionState(state: number): AttentionState {
    switch (state) {
        case 0x01:
            return 'asleep';

        case 0x02:
            return 'screensaver';

        case 0x03:
            return 'awake';

        case 0x04:
            return 'idle';

        default:
            return 'unknown';
    }
}
