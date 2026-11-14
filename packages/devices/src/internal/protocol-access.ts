import type { AirPlayManager } from './airplay-manager';
import type { CompanionLinkManager } from './companion-link-manager';

/**
 * Internal interface that provides controllers access to the underlying
 * protocol implementations. Not exported publicly.
 */
export type ProtocolAccess = {
    readonly airplay: AirPlayManager;
    readonly companionLink?: CompanionLinkManager;
};
