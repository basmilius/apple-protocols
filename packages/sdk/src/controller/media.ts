import type { AudioSource } from '@basmilius/apple-common';
import type { AirPlayManager } from '../internal';

/**
 * Media source controller for Apple devices.
 * Provides URL playback (device fetches and plays) and audio streaming (client sends PCM via RTP).
 */
export class MediaController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    /**
     * Plays a URL on the device. The device fetches and plays the content.
     * Creates a separate protocol session to avoid conflicting with remote control.
     *
     * @param url - The media URL to play.
     * @param position - Start position in seconds (default: 0).
     */
    async playUrl(url: string, position: number = 0): Promise<void> {
        await this.#airplay.playUrl(url, position);
    }

    /**
     * Stops the current URL playback.
     */
    stopPlayUrl(): void {
        this.#airplay.stopPlayUrl();
    }

    /**
     * Waits for the current URL playback to end naturally.
     */
    async waitForPlaybackEnd(): Promise<void> {
        await this.#airplay.waitForPlaybackEnd();
    }

    /**
     * Streams audio from a source to the device via RAOP/RTP.
     * Creates a separate protocol session to avoid conflicting with remote control.
     *
     * @param source - The audio source to stream (MP3, OGG, WAV, PCM, FFmpeg, URL, live).
     */
    async streamAudio(source: AudioSource): Promise<void> {
        await this.#airplay.streamAudio(source);
    }

    /**
     * Stops the current audio stream.
     */
    stopStreamAudio(): void {
        this.#airplay.stopStreamAudio();
    }

    /**
     * Requests lyrics for the current playback.
     *
     * @param length - Maximum number of lyrics items to retrieve.
     */
    async requestLyrics(length: number = 10): Promise<void> {
        await this.#airplay.requestPlaybackQueue(length);
    }
}
