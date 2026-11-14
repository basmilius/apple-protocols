/**
 * Symbol used to access the current AirPlay session of an AirPlayManager.
 */
export const PROTOCOL: unique symbol = Symbol('com.basmilius.airplay:protocol');

/**
 * Symbol used by the AirPlay controllers to reach the MRP data channel and the logging context.
 */
export const MRP_CHANNEL: unique symbol = Symbol('com.basmilius.airplay:mrp-channel');

/**
 * Symbol used to subscribe AirPlayState to DataStream events.
 */
export const STATE_SUBSCRIBE_SYMBOL: unique symbol = Symbol('com.basmilius.airplay:subscribe');

/**
 * Symbol used to unsubscribe AirPlayState from DataStream events.
 */
export const STATE_UNSUBSCRIBE_SYMBOL: unique symbol = Symbol('com.basmilius.airplay:unsubscribe');

/**
 * Symbol used to access the underlying Companion Link Protocol instance from a CompanionLinkManager.
 */
export const COMPANION_LINK_PROTOCOL: unique symbol = Symbol('com.basmilius.companion-link:protocol');
