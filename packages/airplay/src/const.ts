/** RTSP port of an AirPlay receiver when discovery did not say otherwise. */
export const DEFAULT_PORT = 7000;

/** Timeout in milliseconds for HTTP and RTSP requests during setup and control. */
export const HTTP_TIMEOUT = 6000;

/** Interval in milliseconds of the `/feedback` keepalive a receiver expects. */
export const FEEDBACK_INTERVAL = 2000;

/** Default number of bytes per audio channel sample (16-bit PCM). */
export const AUDIO_BYTES_PER_CHANNEL = 2;

/** Default number of audio channels (stereo). */
export const AUDIO_CHANNELS = 2;

/** Number of PCM audio frames packed into a single RTP packet (ALAC/RAOP standard). */
export const AUDIO_FRAMES_PER_PACKET = 352;

/** Default audio sample rate in Hz (CD quality). */
export const AUDIO_SAMPLE_RATE = 44100;
