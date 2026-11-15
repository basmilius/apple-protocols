/** RTSP port of an AirPlay receiver when discovery did not say otherwise. */
export const DEFAULT_PORT = 7000;

/** Timeout in milliseconds for HTTP and RTSP requests during setup and control. */
export const HTTP_TIMEOUT = 6000;

/** Interval in milliseconds of the `/feedback` keepalive a receiver expects. */
export const FEEDBACK_INTERVAL = 2000;

/** Bytes per sample per channel: 16-bit PCM. */
export const AUDIO_BYTES_PER_CHANNEL = 2;

/** Stereo. */
export const AUDIO_CHANNELS = 2;

/** PCM frames per RTP packet, the ALAC and RAOP standard. */
export const AUDIO_FRAMES_PER_PACKET = 352;

/** Sample rate in Hz, CD quality. */
export const AUDIO_SAMPLE_RATE = 44100;
