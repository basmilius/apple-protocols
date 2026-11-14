/**
 * Symbol used to access the current AirPlay session of an AirPlayManager.
 */
export const PROTOCOL: unique symbol = Symbol('com.basmilius.airplay:protocol');

/**
 * Symbol used to access the underlying Companion Link Protocol instance from a CompanionLinkManager.
 */
export const COMPANION_LINK_PROTOCOL: unique symbol = Symbol('com.basmilius.companion-link:protocol');
