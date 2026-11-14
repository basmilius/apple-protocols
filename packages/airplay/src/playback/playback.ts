import { getMacAddress, PlaybackError, waitFor } from '@corewire/core';
import type { Context } from '@corewire/core/transport';
import { Plist } from '@corewire/core/encoding';
import { AirPlayFeatureFlags, hasFeatureFlag } from '../airplayFeatures';
import type { ControlChannel } from '../channels/control';
import type { EventChannel } from '../channels/event';
import type { AirPlaySession } from '../session';
import { PlayQueueSession, type PlayQueueState } from './playQueue';

/** Maximum number of attempts of `POST /play` while it answers 500. */
const PLAY_RETRIES = 3;

/** Interval in milliseconds between `/playback-info` polls. */
const PLAYBACK_POLL_INTERVAL = 1000;

/** Number of consecutive polls without a duration before playback counts as ended. */
const PLAYBACK_IDLE_THRESHOLD = 5;

/** CMTime with all fields zero, which the receiver reads as "no end time". */
const NO_END_TIME = {flags: 0, value: 0, epoch: 0, timescale: 0};

/** Playback information from `GET /playback-info`, or from the play queue events in a play queue session. */
export type PlaybackInfo = {
    duration?: number;
    position?: number;
    rate?: number;
    readyToPlay?: boolean;
    error?: {code: number; domain: string};

    /** Playback state of a play queue session; `GET /playback-info` does not report it. */
    state?: PlayQueueState;
};

/** What a URL playback needs from the dedicated session it runs on. */
export type UrlPlaybackChannels = {
    readonly session: AirPlaySession;
    readonly context: Context;
    readonly control: ControlChannel;
    readonly events: EventChannel;
    readonly features: bigint;
    readonly sessionUUID: string;

    /** The `macAddress` of the first SETUP; prefix of the play queue channel ID. */
    readonly senderMac: string;
};

/**
 * A URL the receiver fetches and plays itself, on a connection of its own so remote control stays
 * untouched. Through the play queue when the receiver has one, otherwise `/play`.
 * Owns its session: {@link stop} and the end of playback close it.
 */
export class UrlPlayback {
    /** Aborts when the playback's connection closes. */
    get signal(): AbortSignal {
        return this.#session.signal;
    }

    readonly #channels: UrlPlaybackChannels;
    readonly #session: AirPlaySession;
    readonly #playQueue?: PlayQueueSession;

    private constructor(channels: UrlPlaybackChannels, playQueue?: PlayQueueSession) {
        this.#channels = channels;
        this.#session = channels.session;
        this.#playQueue = playQueue;

        // Our own close ends a play queue cleanly, also before playback started.
        this.#session.signal.addEventListener('abort', () => {
            if (this.#session.closeReason === 'local') {
                this.#playQueue?.close();
            }
        }, {once: true});
    }

    /**
     * Starts playback after RECORD: through the play queue when the receiver supports it, else
     * with `POST /play`, retrying 500 responses.
     *
     * @throws {PlaybackError} When playback fails, or the play queue fails on a receiver without `/play`.
     */
    static async start(channels: UrlPlaybackChannels, url: string, position: number): Promise<UrlPlayback> {
        const playQueue = await startPlayQueue(channels, url, position);

        if (playQueue) {
            return new UrlPlayback(channels, playQueue);
        }

        await playLegacy(channels, url, position);

        return new UrlPlayback(channels);
    }

    /**
     * The current playback info. A play queue session answers from its last `playing` event,
     * because `GET /playback-info` fails there (500 on tvOS 26, 403 on tvOS 27).
     *
     * @returns Empty when nothing plays, null when the receiver did not answer.
     */
    async getPlaybackInfo(): Promise<PlaybackInfo | null> {
        if (this.#playQueue) {
            return this.#playQueue.lastInfo;
        }

        try {
            const response = await this.#channels.control.get('/playback-info');

            if (!response.ok) {
                return null;
            }

            const body = await response.arrayBuffer();

            if (body.byteLength === 0) {
                return {};
            }

            return Plist.parse(body) as PlaybackInfo;
        } catch {
            return null;
        }
    }

    /**
     * Resolves when playback ends, then closes the connection. A play queue session follows its
     * events. Otherwise this polls `/playback-info`: playback starts with the first answer that has
     * a duration and ends after {@link PLAYBACK_IDLE_THRESHOLD} answers in a row without one, or
     * when the receiver stops answering.
     *
     * @throws {PlaybackError} When the receiver reports a playback error.
     */
    async waitForEnd(): Promise<void> {
        try {
            if (this.#playQueue) {
                await this.#playQueue.waitForEnd();
            } else {
                await this.#poll();
            }
        } finally {
            void this.#session.close();
        }
    }

    /** Stops playback and closes the connection, without TEARDOWN. */
    stop(): void {
        this.#playQueue?.close();
        void this.#session.close();
    }

    async #poll(): Promise<void> {
        const logger = this.#channels.context.logger;
        let playbackStarted = false;
        let idleCount = 0;

        while (true) {
            const info = await this.getPlaybackInfo();

            if (!info) {
                logger.debug('[protocol]', 'Connection lost, assuming playback stopped.');

                return;
            }

            if (info.error) {
                throw new PlaybackError(`Playback error: ${info.error.code} (${info.error.domain})`);
            }

            if (info.duration !== undefined) {
                playbackStarted = true;
                idleCount = 0;
            } else if (playbackStarted) {
                idleCount++;

                if (idleCount >= PLAYBACK_IDLE_THRESHOLD) {
                    logger.debug('[protocol]', 'Playback ended.');

                    return;
                }
            }

            await waitFor(PLAYBACK_POLL_INTERVAL);
        }
    }
}

/**
 * Queues the URL through the play queue when the receiver advertises one.
 *
 * @returns The running play queue, or undefined when `/play` should be used instead.
 * @throws {PlaybackError} When the play queue fails on a receiver that has no `/play`.
 */
async function startPlayQueue(channels: UrlPlaybackChannels, url: string, position: number): Promise<PlayQueueSession | undefined> {
    const {context, features} = channels;
    const playQueue = hasFeatureFlag(features, AirPlayFeatureFlags.SupportsAirPlayVideoPlayQueue);
    const videoV2 = hasFeatureFlag(features, AirPlayFeatureFlags.SupportsAirPlayVideoV2);
    const videoV1 = hasFeatureFlag(features, AirPlayFeatureFlags.SupportsAirPlayVideoV1);
    const bits = `VideoPlayQueue=${playQueue}, VideoV2=${videoV2}, VideoV1=${videoV1}`;

    if (!playQueue && !videoV2) {
        context.logger.info('[protocol]', `playUrl via /play (${bits})`);

        return undefined;
    }

    context.logger.info('[protocol]', `playUrl via play queue (${bits})`);

    const session = new PlayQueueSession(context, channels.control, channels.events, channels.sessionUUID, channels.senderMac);

    try {
        if (await session.setup() && await session.start(url, position)) {
            return session;
        }
    } catch (err) {
        session.close();

        throw err;
    }

    session.close();

    // LG and Samsung answer /play with 404.
    if (videoV2 && !videoV1) {
        throw new PlaybackError('The play queue failed and this receiver does not support /play.');
    }

    context.logger.warn('[protocol]', `Play queue failed, falling back to /play (${bits})`);

    return undefined;
}

/** `POST /play`, retrying 500 responses because the receiver may need time to prepare, then the playback properties. */
async function playLegacy(channels: UrlPlaybackChannels, url: string, position: number): Promise<void> {
    const {context, control} = channels;
    const identity = context.identity;
    let lastStatus = 0;

    for (let retry = 0; retry < PLAY_RETRIES; retry++) {
        const response = await control.post('/play', {
            'Content-Location': url,
            'Start-Position-Seconds': position,
            uuid: channels.sessionUUID.toUpperCase(),
            streamType: 1,
            mediaType: 'file',
            volume: 1.0,
            rate: 1.0,
            clientBundleID: 'com.basmilius.apple-protocols',
            clientProcName: identity.name,
            osBuildVersion: identity.osBuildVersion,
            model: identity.model,
            SenderMACAddress: getMacAddress().toUpperCase()
        });

        lastStatus = response.status;
        context.logger.info('[protocol]', `play_url response: ${lastStatus} (attempt ${retry + 1}/${PLAY_RETRIES})`);

        if (lastStatus === 200) {
            break;
        }

        if (lastStatus === 500) {
            context.logger.warn('[protocol]', 'play_url returned 500, retrying...');
            await waitFor(1000);
            continue;
        }

        if (lastStatus >= 400) {
            throw new PlaybackError(`Failed to play URL: ${lastStatus}`);
        }
    }

    if (lastStatus !== 200) {
        throw new PlaybackError(`Failed to play URL after ${PLAY_RETRIES} retries: ${lastStatus}`);
    }

    await control.put('/setProperty?isInterestedInDateRange', {value: true});
    await control.put('/setProperty?actionAtItemEnd', {value: 0});
    await control.post('/rate?value=1.000000');
    await control.put('/setProperty?forwardEndTime', {value: NO_END_TIME});
    await control.put('/setProperty?reverseEndTime', {value: NO_END_TIME});
}
