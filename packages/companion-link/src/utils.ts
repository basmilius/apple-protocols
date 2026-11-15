import type { AttentionState } from './types';

/** Maps the numeric attention state of the Apple TV to its name; `unknown` for any other value. */
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
