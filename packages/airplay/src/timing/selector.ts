import { AirPlayFeatureFlags, hasFeatureFlag } from '../airplayFeatures';

/**
 * Timing strategy negotiated with an AirPlay receiver.
 *
 * - `PTP` — receiver advertises IEEE 1588 support; we act as grandmaster.
 * - `NTP` — legacy AirPlay / pre-PTP receivers; our NTP timing server is used.
 * - `None` — no shared clock (e.g. when we have no timing server configured).
 */
export type TimingStrategy = 'PTP' | 'NTP' | 'None';

/**
 * Picks the timing strategy for a receiver based on its advertised feature
 * flags. The caller decides at SETUP-time which of the available strategies
 * it can actually provide (e.g. only `NTP` if no {@link PtpMaster} was
 * configured), but this helper encodes the preference order.
 *
 * @param receiverFeatures - The feature bitmask parsed from GET /info.
 * @returns The preferred timing strategy.
 */
export function selectTimingStrategy(receiverFeatures: bigint): TimingStrategy {
    if (hasFeatureFlag(receiverFeatures, AirPlayFeatureFlags.SupportsPTP)) {
        return 'PTP';
    }

    return 'NTP';
}
