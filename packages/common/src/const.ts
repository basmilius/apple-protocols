/** Default number of bytes per audio channel sample (16-bit PCM). */
export const AUDIO_BYTES_PER_CHANNEL = 2;

/** Default number of audio channels (stereo). */
export const AUDIO_CHANNELS = 2;

/** Number of PCM audio frames packed into a single RTP packet (ALAC/RAOP standard). */
export const AUDIO_FRAMES_PER_PACKET = 352;

/** Default audio sample rate in Hz (CD quality). */
export const AUDIO_SAMPLE_RATE = 44100;

/** Default PIN used for transient (non-persistent) AirPlay pairing sessions. */
export const AIRPLAY_TRANSIENT_PIN = '3939';

/** Timeout in milliseconds for HTTP requests during setup and control. */
export const HTTP_TIMEOUT = 6000;

/** Timeout in milliseconds for TCP socket connections during initial connect. Matches Apple's 30s default. */
export const SOCKET_TIMEOUT = 30000;

/** mDNS service type for AirPlay device discovery. */
export const AIRPLAY_SERVICE = '_airplay._tcp.local';

/** mDNS service type for Companion Link (remote control protocol) device discovery. */
export const COMPANION_LINK_SERVICE = '_companion-link._tcp.local';

/** mDNS service type for RAOP (Remote Audio Output Protocol) device discovery. */
export const RAOP_SERVICE = '_raop._tcp.local';
