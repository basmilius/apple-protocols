/** Default PIN used for transient (non-persistent) AirPlay pairing sessions. */
export const AIRPLAY_TRANSIENT_PIN = '3939';

/** Timeout in milliseconds for HTTP requests during setup and control. */
export const HTTP_TIMEOUT = 6000;

/** Timeout in milliseconds for TCP socket connections during initial connect. */
export const SOCKET_TIMEOUT = 10000;

/** mDNS service type for AirPlay device discovery. */
export const AIRPLAY_SERVICE = '_airplay._tcp.local';

/** mDNS service type for Companion Link (remote control protocol) device discovery. */
export const COMPANION_LINK_SERVICE = '_companion-link._tcp.local';

/** mDNS service type for RAOP (Remote Audio Output Protocol) device discovery. */
export const RAOP_SERVICE = '_raop._tcp.local';
