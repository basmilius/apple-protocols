import { AirPlayFeatureFlags, hasFeatureFlag } from '../airplayFeatures';

/**
 * Timing strategy negotiated with an AirPlay receiver.
 *
 * - `PTP`: the receiver advertises IEEE 1588 support and we act as grandmaster.
 * - `NTP`: a legacy or pre-PTP receiver, served by our NTP timing server.
 * - `None`: no shared clock, for example without a configured timing server.
 */
export type TimingStrategy = 'PTP' | 'NTP' | 'None';

/**
 * Picks the preferred timing strategy from a receiver's feature flags. The
 * caller decides at SETUP which strategy it can provide, for example only
 * `NTP` without a {@link PtpMaster}.
 *
 * @param receiverFeatures - The feature bitmask from GET /info.
 */
export function selectTimingStrategy(receiverFeatures: bigint): TimingStrategy {
    if (hasFeatureFlag(receiverFeatures, AirPlayFeatureFlags.SupportsPTP)) {
        return 'PTP';
    }

    return 'NTP';
}
