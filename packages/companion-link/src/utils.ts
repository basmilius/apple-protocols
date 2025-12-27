import type { AttentionState } from './types';

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
