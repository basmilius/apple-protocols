/**
 * Dynamic latency manager for AirPlay audio streaming.
 *
 * Implements a tier-based latency system inspired by Apple's DynamicLatencyManager.
 * Monitors audio glitches (packet loss, late arrivals) and adjusts the latency
 * tier accordingly: glitches increase latency, stable periods decrease it.
 */

/** Available latency tiers in ascending order (as fractions of sample rate). */
const LATENCY_TIERS = [0.25, 0.5, 1.0, 2.0] as const;

/** Number of consecutive successful packets needed to drop one latency tier. */
const STABILITY_THRESHOLD = 500;

/** Number of glitches within the glitch window that trigger a tier increase. */
const GLITCH_THRESHOLD = 3;

/** Time window in milliseconds for counting glitches. */
const GLITCH_WINDOW_MS = 5000;

/**
 * Manages dynamic latency for an audio stream.
 *
 * Usage:
 * 1. Create with `new LatencyManager(sampleRate)`
 * 2. Call `getLatency()` to get the current latency in samples
 * 3. Call `reportSuccess()` after each successful packet
 * 4. Call `reportGlitch()` when a glitch is detected (packet loss, NACK, late arrival)
 * 5. The manager automatically adjusts the latency tier
 */
export default class LatencyManager {
    readonly #sampleRate: number;
    #tierIndex: number = 0;
    #consecutiveSuccesses: number = 0;
    #glitchTimestamps: number[] = [];

    /**
     * Creates a new LatencyManager.
     *
     * @param sampleRate - The audio sample rate in Hz (e.g. 44100, 48000).
     * @param initialTierIndex - Starting tier index (defaults to 0, lowest latency).
     */
    constructor(sampleRate: number, initialTierIndex: number = 0) {
        this.#sampleRate = sampleRate;
        this.#tierIndex = Math.min(Math.max(0, initialTierIndex), LATENCY_TIERS.length - 1);
    }

    /** Current latency tier index (0 = lowest latency, 3 = highest). */
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

    /** Whether the manager is at the maximum latency tier. */
    get isMaxTier(): boolean {
        return this.#tierIndex >= LATENCY_TIERS.length - 1;
    }

    /** Whether the manager is at the minimum latency tier. */
    get isMinTier(): boolean {
        return this.#tierIndex <= 0;
    }

    /**
     * Returns the current latency in samples.
     * Alias for the `latency` getter for use in streaming loops.
     */
    getLatency(): number {
        return this.latency;
    }

    /**
     * Reports a successfully sent and acknowledged packet.
     * After enough consecutive successes, drops to a lower latency tier.
     */
    reportSuccess(): void {
        this.#consecutiveSuccesses++;

        if (this.#consecutiveSuccesses >= STABILITY_THRESHOLD && !this.isMinTier) {
            this.#tierIndex--;
            this.#consecutiveSuccesses = 0;
        }
    }

    /**
     * Reports a glitch (packet loss, retransmission request, late arrival).
     * If enough glitches occur within the time window, increases the latency tier.
     */
    reportGlitch(): void {
        this.#consecutiveSuccesses = 0;

        const now = Date.now();
        this.#glitchTimestamps.push(now);

        // Remove old glitches outside the window.
        const windowStart = now - GLITCH_WINDOW_MS;
        this.#glitchTimestamps = this.#glitchTimestamps.filter(ts => ts >= windowStart);

        if (this.#glitchTimestamps.length >= GLITCH_THRESHOLD && !this.isMaxTier) {
            this.#tierIndex++;
            this.#glitchTimestamps = [];
        }
    }

    /** Resets the manager to the initial (lowest) latency tier. */
    reset(): void {
        this.#tierIndex = 0;
        this.#consecutiveSuccesses = 0;
        this.#glitchTimestamps = [];
    }
}
