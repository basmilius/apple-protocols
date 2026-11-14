import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Client, MediaRemote, MediaRemoteState, Proto } from '@corewire/airplay/mrp';
import { UnavailableError } from '../errors';
import type { Lyrics, NowPlaying, NowPlayingCommand, PlaybackState } from '../types';
import { COMMANDS, playbackStateOf, toNowPlaying } from './snapshot';

/**
 * How long a new session may take to report the item again. A device names the app, then sends
 * the state and the metadata in separate messages, about a hundred milliseconds apart.
 */
const RESTORE_SETTLE = 1000;

/** How long a restore may last once the new session is up, also when the device reports nothing. */
const RESTORE_TIMEOUT = 5000;

/** Fingerprints per image buffer, so the bytes of one SET_ARTWORK are hashed once. */
const FINGERPRINTS: WeakMap<Uint8Array, string> = new WeakMap();

type EventMap = {
    /** The public item differs from the last one this object emitted. */
    change: [item: NowPlaying | null];

    /**
     * The playback state differs from the last one this object announced; a `change` to null resets
     * that to `unknown`. Fires before the matching `change`.
     */
    state: [state: PlaybackState, previous: PlaybackState, item: NowPlaying];

    /** The artwork of the current item changed: another URL, or image bytes that arrived. */
    artwork: [item: NowPlaying];
};

function sameItem(a: NowPlaying | null | undefined, b: NowPlaying | null | undefined): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Length and hash of image bytes: the same image sent again matches, other bytes for the same item do not. */
function fingerprintOf(bytes: Uint8Array | null | undefined): string | null {
    if (!bytes || bytes.byteLength === 0) {
        return null;
    }

    let fingerprint = FINGERPRINTS.get(bytes);

    if (!fingerprint) {
        fingerprint = `${bytes.byteLength}:${createHash('sha1').update(bytes).digest('base64')}`;
        FINGERPRINTS.set(bytes, fingerprint);
    }

    return fingerprint;
}

/**
 * What plays now, as snapshots with own types. Every event compares public values with the last
 * ones this object announced, and those survive sessions: a reconnect that brings back the same
 * item, state or artwork emits nothing, so a network blip does not look like playback stopping
 * and starting.
 */
export class NowPlayingControl extends EventEmitter<EventMap> {
    /** The current item. While a new session has not reported it again, the last announced one. */
    get current(): NowPlaying | null {
        return this.#restoring ? this.#last ?? null : toNowPlaying(this.#state.nowPlayingClient);
    }

    /** Elapsed seconds now, extrapolated from the playback rate while playing. */
    get elapsed(): number {
        return this.#restoring ? this.#heldElapsed : this.#state.nowPlayingClient?.elapsedTime ?? 0;
    }

    readonly #remote: () => MediaRemote | undefined;
    readonly #state: MediaRemoteState;
    #artwork?: string;
    #deadline?: NodeJS.Timeout;
    #heldElapsed: number = 0;
    #last?: NowPlaying | null;
    #lastState: PlaybackState = 'unknown';
    #restoring: boolean = false;
    #settle?: NodeJS.Timeout;

    constructor(state: MediaRemoteState, remote: () => MediaRemote | undefined) {
        super();

        this.#remote = remote;
        this.#state = state;

        state.on('nowPlayingChanged', client => this.#onNowPlayingChanged(client));
        state.on('playbackStateChanged', (client, _player, _oldState, newState) => this.#onPlaybackStateChanged(client, newState));
        state.on('artworkChanged', client => this.#onArtworkChanged(client));
    }

    /** Whether the now-playing app accepts the command. */
    supports(command: NowPlayingCommand): boolean {
        return this.#state.nowPlayingClient?.isCommandSupported(COMMANDS[command]) ?? false;
    }

    /** Lyrics of the current item from the playback queue. */
    async lyrics(): Promise<Lyrics | null> {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('nowPlaying', 'disconnected');
        }

        const item = await remote.playbackQueue.requestAssets();

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

    /**
     * Holds the announced values while the model is cleared for a new session, until that session
     * reports the same item, another item settled for {@link RESTORE_SETTLE}, or {@link resume} timed
     * out. Called right before the clear.
     */
    hold(): void {
        if (!this.#restoring) {
            this.#heldElapsed = this.#state.nowPlayingClient?.elapsedTime ?? 0;
        }

        this.#endRestore();
        this.#restoring = this.#last !== undefined;
    }

    /**
     * Ends the restore within {@link RESTORE_TIMEOUT}, so a session that reports nothing does not
     * keep the held values. Called once the new session is up.
     */
    resume(): void {
        if (!this.#restoring) {
            return;
        }

        clearTimeout(this.#deadline);
        this.#deadline = setTimeout(() => this.#settleRestore(), RESTORE_TIMEOUT);
        this.#deadline.unref();
    }

    /** The artwork as far as it can be seen from outside: its identifier, its URL and its bytes. */
    #artworkOf(client: Client | null): string {
        return JSON.stringify([client?.artworkId ?? null, client?.artworkUrl() ?? null, fingerprintOf(client?.currentItemArtwork), fingerprintOf(this.#state.artworkJpegData)]);
    }

    #onArtworkChanged(client: Client): void {
        if (this.#restoring) {
            return;
        }

        const artwork = this.#artworkOf(client);

        if (artwork === this.#artwork) {
            return;
        }

        this.#artwork = artwork;
        this.emit('artwork', toNowPlaying(client));
    }

    #onNowPlayingChanged(client: Client | null): void {
        const item = toNowPlaying(client);

        if (!this.#restoring) {
            this.#publish(item, client);

            return;
        }

        if (sameItem(item, this.#last)) {
            this.#endRestore();

            return;
        }

        clearTimeout(this.#settle);
        this.#settle = setTimeout(() => this.#settleRestore(), RESTORE_SETTLE);
        this.#settle.unref();
    }

    #onPlaybackStateChanged(client: Client, newState: Proto.PlaybackState_Enum): void {
        const state = playbackStateOf(newState);
        const previous = this.#lastState;

        if (state === previous) {
            return;
        }

        this.#lastState = state;
        this.emit('state', state, previous, toNowPlaying(client));
    }

    #endRestore(): void {
        clearTimeout(this.#settle);
        clearTimeout(this.#deadline);
        this.#settle = undefined;
        this.#deadline = undefined;
        this.#restoring = false;
    }

    /** Ends the restore and announces what the model holds now, when it differs from the last announced. */
    #settleRestore(): void {
        this.#endRestore();

        const current = this.#state.nowPlayingClient;

        this.#publish(toNowPlaying(current), current);
    }

    /** Announces the item when it differs; a same item whose artwork arrived announces the artwork instead. */
    #publish(item: NowPlaying | null, client: Client | null): void {
        if (sameItem(item, this.#last)) {
            const artwork = this.#artworkOf(client);

            if (item && artwork !== this.#artwork && (client?.artworkUrl() != null || client?.currentItemArtwork != null)) {
                this.#artwork = artwork;
                this.emit('artwork', item);
            }

            return;
        }

        this.#last = item;
        this.#artwork = this.#artworkOf(client);

        // The model only reports a state change of the app that plays; a state that changed while the
        // app took over, or while the session was down, is announced here so `state` stays truthful.
        // Without an item no state is announced, so the next item announces its state as new.
        const previous = this.#lastState;

        if (!item) {
            this.#lastState = 'unknown';
        } else if (item.state !== previous) {
            this.#lastState = item.state;
            this.emit('state', item.state, previous, item);
        }

        this.emit('change', item);
    }
}
