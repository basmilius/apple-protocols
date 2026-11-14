/* The PCM format an AudioSource delivers; keep in sync with the AUDIO_* constants of @corewire/airplay. */

/** Default number of bytes per audio channel sample (16-bit PCM). */
export const AUDIO_BYTES_PER_CHANNEL = 2;

/** Default number of audio channels (stereo). */
export const AUDIO_CHANNELS = 2;

/** Default audio sample rate in Hz (CD quality). */
export const AUDIO_SAMPLE_RATE = 44100;

/** Seconds of audio in a buffer of PCM in the format above. */
export function durationOf(pcm: Buffer): number {
    return pcm.length / (AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) / AUDIO_SAMPLE_RATE;
}
