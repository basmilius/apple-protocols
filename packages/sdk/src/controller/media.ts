import type { AudioSource } from '@basmilius/apple-common';
import type { AirPlayManager } from '../internal';
import { fetchAppleMusicLyrics, type AppleMusicLyricsOptions } from '../internal/apple-music-lyrics';

export type LyricsResult = {
    readonly identifier: string;
    readonly text: string | null;
    readonly available: boolean | null;
    readonly url: string | null;
    readonly catalogId: string | null;
};

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
     * @param volumeDb - Stream volume in dB (-144 = mute, 0 = max). A fresh audio
     *   session starts silent, so an audible default is applied.
     */
    async streamAudio(source: AudioSource, volumeDb: number = -20): Promise<void> {
        await this.#airplay.streamAudio(source, volumeDb);
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
     * @param length - Maximum number of queue items to retrieve.
     */
    async requestLyrics(length: number = 10): Promise<void> {
        await this.#airplay.requestPlaybackQueue(length);
    }

    /** Opt-in authenticated catalog lookup, independent of Apple TV pairing credentials. */
    async getLyricsFromCatalog(options: AppleMusicLyricsOptions): Promise<LyricsResult | null> {
        const player = this.#airplay.state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;
        const catalogId = player?.currentItemMetadata?.lyricsAdamID;
        if (!identifier || !catalogId) return null;

        const text = await fetchAppleMusicLyrics(catalogId.toString(), options);
        if (this.#airplay.state.nowPlayingClient?.activePlayer !== player || player.currentItem?.identifier !== identifier) return null;
        return {identifier, catalogId: catalogId.toString(), text, available: text ? true : null, url: null};
    }

    /** Reads queue lyrics rather than waiting for independent SEND_LYRICS_EVENT messages. */
    async getLyrics(): Promise<LyricsResult | null> {
        const item = await this.#airplay.requestContentItemAssets();

        if (!item) {
            return null;
        }

        return {
            identifier: item.identifier,
            text: item.lyrics?.lyrics || null,
            available: item.metadata && Object.hasOwn(item.metadata, 'lyricsAvailable') ? item.metadata.lyricsAvailable : null,
            url: item.metadata?.lyricsURL || null,
            catalogId: item.metadata?.lyricsAdamID ? item.metadata.lyricsAdamID.toString() : null
        };
    }
}
