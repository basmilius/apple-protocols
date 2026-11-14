import type { AirPlaySession, AudioSource } from '@corewire/airplay';
import { ConnectionClosedError } from '@corewire/core';
import { requireSession, UnavailableError } from '../errors';
import type { PlayUrlOptions, StreamAudioOptions } from '../types';

/** The dB a fresh audio stream gets without a volume; it starts silent otherwise. */
const DEFAULT_VOLUME_DB = -20;

/** The curve RAOP uses as well: 0 is silent (-144 dB), 1 is 0 dB. */
function toDecibels(volume: number): number {
    if (volume <= 0) {
        return -144;
    }

    return 20 * Math.log10(Math.min(volume, 1));
}

/**
 * One URL playback or audio stream on a connection of its own. It ends when it played out, on
 * {@link stop}, or when the AirPlay session of the device ends.
 */
export class MediaPlayback {
    get kind(): 'url' | 'audio' {
        return this.#kind;
    }

    /**
     * Settles when playback ended. For a URL the device is polled or watched from the first read
     * on, so a consumer that never reads this sends nothing extra.
     */
    get ended(): Promise<void> {
        this.#ended ??= this.#wait();

        return this.#ended;
    }

    readonly #kind: 'url' | 'audio';
    readonly #stop: () => void;
    readonly #wait: () => Promise<void>;
    #ended?: Promise<void>;

    constructor(kind: 'url' | 'audio', wait: () => Promise<void>, stop: () => void) {
        this.#kind = kind;
        this.#stop = stop;
        this.#wait = wait;
    }

    stop(): void {
        this.#stop();
    }
}

type Running = {
    readonly abort: AbortController;
    playback?: MediaPlayback;
};

/**
 * URL playback and audio streaming. Each runs on its own connection, so remote control stays
 * untouched, and a new one of a kind stops the previous one.
 */
export class MediaControl {
    readonly #session: () => AirPlaySession | undefined;
    #audio?: Running;
    #url?: Running;

    constructor(session: () => AirPlaySession | undefined) {
        this.#session = session;
    }

    /**
     * Has the device fetch and play a URL. Resolves once playback started.
     *
     * @throws {UnavailableError} When the device cannot play URLs; stream the audio instead.
     * @throws {PlaybackError} When the device refuses this URL.
     */
    async playUrl(url: string, options: PlayUrlOptions = {}): Promise<MediaPlayback> {
        const session = requireSession(this.#session(), 'playUrl');

        if (!session.supportsUrlPlayback) {
            throw new UnavailableError('playUrl', 'unsupported', 'This device cannot play a URL itself; stream the audio instead.');
        }

        this.#url?.abort.abort();
        this.#url?.playback?.stop();

        const running: Running = {abort: new AbortController()};
        const signal = options.signal ? AbortSignal.any([running.abort.signal, options.signal]) : running.abort.signal;

        this.#url = running;

        const playback = await session.playUrl(url, {position: options.position ?? 0, signal});

        if (this.#url !== running) {
            playback.stop();

            throw new ConnectionClosedError('URL playback cancelled.');
        }

        running.playback = new MediaPlayback('url', async () => {
            try {
                await playback.ended;
            } finally {
                if (this.#url === running) {
                    this.#url = undefined;
                }
            }
        }, () => {
            running.abort.abort();
            playback.stop();
        });

        return running.playback;
    }

    /**
     * Streams audio to the device. Resolves once the stream is set up; {@link MediaPlayback.ended}
     * settles when the source ran out and the stream was torn down.
     */
    async streamAudio(source: AudioSource, options: StreamAudioOptions = {}): Promise<MediaPlayback> {
        const session = requireSession(this.#session(), 'streamAudio');

        this.#audio?.abort.abort();
        this.#audio?.playback?.stop();

        const running: Running = {abort: new AbortController()};
        const signal = options.signal ? AbortSignal.any([running.abort.signal, options.signal]) : running.abort.signal;
        const volumeDb = options.volume === undefined ? DEFAULT_VOLUME_DB : toDecibels(options.volume);

        this.#audio = running;

        const playback = await session.streamAudio(source, {volumeDb, signal});

        if (this.#audio !== running) {
            playback.stop();

            throw new ConnectionClosedError('Audio stream cancelled.');
        }

        const finished = playback.ended.finally(() => {
            if (this.#audio === running) {
                this.#audio = undefined;
            }
        });

        finished.catch(() => undefined);

        running.playback = new MediaPlayback('audio', () => finished, () => {
            running.abort.abort();
            playback.stop();
        });

        return running.playback;
    }
}
