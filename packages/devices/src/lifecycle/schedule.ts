import type { RetryPhase } from '../types';

const QUICK_DELAYS: readonly number[] = [1000, 2000, 4000];
const SLOW_DELAY = 120_000;
const SLOW_ATTEMPTS = 15;
const RARE_DELAY = 900_000;

/**
 * How a protocol retries. An Apple TV keeps a slow phase before it settles on the rare one; a HomePod
 * goes straight there. Neither ever gives up; these delays are a floor consumers rely on.
 */
export type Schedule = 'appleTv' | 'homePod';

export type Retry = {
    readonly delay: number;
    readonly phase: RetryPhase;
};

/** Returns the delay and phase of retry `index`, counting from 0 after a drop or after the first failed connect. */
export function nextRetry(schedule: Schedule, index: number): Retry {
    if (index < QUICK_DELAYS.length) {
        return {delay: QUICK_DELAYS[index], phase: 'quick'};
    }

    if (schedule === 'appleTv' && index < QUICK_DELAYS.length + SLOW_ATTEMPTS) {
        return {delay: SLOW_DELAY, phase: 'slow'};
    }

    return {delay: RARE_DELAY, phase: 'rare'};
}
