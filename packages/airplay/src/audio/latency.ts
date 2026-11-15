/** Latency tiers in ascending order, in seconds (fractions of the sample rate). */
const LATENCY_TIERS = [0.25, 0.5, 1.0, 2.0] as const;

/** Number of consecutive successful packets needed to drop one latency tier. */
const STABILITY_THRESHOLD = 500;

/** Number of glitches within the glitch window that trigger a tier increase. */
const GLITCH_THRESHOLD = 3;

/** Time window in milliseconds for counting glitches. */
const GLITCH_WINDOW_MS = 5000;

/**
 * Picks the latency tier of an audio stream. Glitches (packet loss, NACK,
 * late arrival) reported through {@link reportGlitch} raise the tier; a run
 * of {@link reportSuccess} calls lowers it.
 */
export class LatencyManager {
    readonly #sampleRate: number;
    #tierIndex: number = 0;
    #consecutiveSuccesses: number = 0;
    #glitchTimestamps: number[] = [];

    /**
     * @param sampleRate - Sample rate in Hz.
     * @param initialTierIndex - 0 for the lowest latency.
     */
    constructor(sampleRate: number, initialTierIndex: number = 0) {
        this.#sampleRate = sampleRate;
        this.#tierIndex = Math.min(Math.max(0, initialTierIndex), LATENCY_TIERS.length - 1);
    }

    /** 0 is the lowest latency, 3 the highest. */
    get tierIndex(): number {
        return this.#tierIndex;
    }

    /** Current latency in samples. */
    get latency(): number {
        return Math.round(this.#sampleRate * LATENCY_TIERS[this.#tierIndex]);
    }

    /** Current latency in milliseconds. */
    get latencyMs(): number {
        return Math.round(LATENCY_TIERS[this.#tierIndex] * 1000);
    }

    get isMaxTier(): boolean {
        return this.#tierIndex >= LATENCY_TIERS.length - 1;
    }

    get isMinTier(): boolean {
        return this.#tierIndex <= 0;
    }

    /** Current latency in samples, same as {@link latency}. */
    getLatency(): number {
        return this.latency;
    }

    /**
     * Reports a packet that was sent and acknowledged. Enough consecutive
     * successes lower the tier.
     */
    reportSuccess(): void {
        this.#consecutiveSuccesses++;

        if (this.#consecutiveSuccesses >= STABILITY_THRESHOLD && !this.isMinTier) {
            this.#tierIndex--;
            this.#consecutiveSuccesses = 0;
        }
    }

    /**
     * Reports a glitch: packet loss, a retransmission request or a late
     * arrival. Enough glitches within the window raise the tier.
     */
    reportGlitch(): void {
        this.#consecutiveSuccesses = 0;

        const now = performance.now();

        this.#glitchTimestamps.push(now);

        const windowStart = now - GLITCH_WINDOW_MS;

        this.#glitchTimestamps = this.#glitchTimestamps.filter(ts => ts >= windowStart);

        if (this.#glitchTimestamps.length >= GLITCH_THRESHOLD && !this.isMaxTier) {
            this.#tierIndex++;
            this.#glitchTimestamps = [];
        }
    }

    /** RFC 2198 redundancy level for the current tier; a higher tier gets more. */
    get recommendedRedundancy(): number {
        if (this.#tierIndex >= 2) {
            return 3;
        }

        if (this.#tierIndex >= 1) {
            return 2;
        }

        return 1;
    }

    /** Returns to the lowest tier. */
    reset(): void {
        this.#tierIndex = 0;
        this.#consecutiveSuccesses = 0;
        this.#glitchTimestamps = [];
    }
}

/**
 * Returns the cluster latency offset in milliseconds for a device model.
 *
 * @param model - Model identifier, for example `'AudioAccessory5,1'`.
 */
export function getClusterLatencyMs(model: string): number {
    if (model.startsWith('AudioAccessory5') || model.startsWith('AudioAccessory6')) {
        return 0; // HomePod 2nd gen, HomePod mini 2nd gen
    }

    if (model.startsWith('AudioAccessory1')) {
        return 110; // HomePod 1st gen
    }

    return 55; // Default for other models
}
