/** Interval in milliseconds between periodic feedback requests to keep the AirPlay session alive. */
export const FEEDBACK_INTERVAL = 2000;

/** Symbol used to access the underlying AirPlay Protocol instance from an AirPlayDevice. */
export const PROTOCOL: unique symbol = Symbol('com.basmilius.airplay:protocol');

/** Symbol used to subscribe AirPlayState to DataStream events. */
export const STATE_SUBSCRIBE_SYMBOL: unique symbol = Symbol('com.basmilius.airplay:subscribe');

/** Symbol used to unsubscribe AirPlayState from DataStream events. */
export const STATE_UNSUBSCRIBE_SYMBOL: unique symbol = Symbol('com.basmilius.airplay:unsubscribe');

/** Symbol used to access the underlying Companion Link Protocol instance from a CompanionLinkManager. */
export const COMPANION_LINK_PROTOCOL: unique symbol = Symbol('com.basmilius.companion-link:protocol');
