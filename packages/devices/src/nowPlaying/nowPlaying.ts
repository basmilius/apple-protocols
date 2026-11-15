import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Client, MediaRemote, MediaRemoteState } from '@corewire/airplay/mrp';
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

export type NowPlayingEventMap = {
    /** The public item differs from the last one this object emitted. */
    change: [item: NowPlaying | null];

    /**
     * The playback state differs from the last one this object announced; a `change` to null resets
     * that to `unknown`. Fires before the matching `change`; while a reconnect restores, it waits for
     * the `change` that ends the restore.
     */
    state: [state: PlaybackState, previous: PlaybackState, item: NowPlaying];

    /** The artwork of the current item changed: another URL, or image bytes that arrived. */
    artwork: [item: NowPlaying];
};

/** The identifier, URL, item bytes and SET_ARTWORK bytes of the artwork, each null while unknown. */
type ArtworkParts = readonly (string | null)[];

function sameItem(a: NowPlaying | null | undefined, b: NowPlaying | null | undefined): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function sameArtwork(a: ArtworkParts | undefined, b: ArtworkParts): boolean {
    return a !== undefined && a.every((part, index) => part === b[index]);
}

/** Returns the length and hash of image bytes, so the same image sent again matches and other bytes do not. */
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
export interface NowPlayingControl extends EventEmitter<NowPlayingEventMap> {
    /** The current item. Until a new session reports it again, this is the last announced one. */
    readonly current: NowPlaying | null;

    /** The elapsed seconds now, extrapolated from the playback rate while playing. */
    readonly elapsed: number;

    /** Checks whether the now-playing app accepts the command. During a restore it answers as the held item did. */
    supports(command: NowPlayingCommand): boolean;

    /** Fetches the lyrics of the current item from the playback queue. */
    lyrics(): Promise<Lyrics | null>;
}

export class NowPlayingController extends EventEmitter<NowPlayingEventMap> implements NowPlayingControl {
    /** The current item. Until a new session reports it again, this is the last announced one. */
    get current(): NowPlaying | null {
        return this.#restoring ? this.#last ?? null : toNowPlaying(this.#state.nowPlayingClient);
    }

    /** The elapsed seconds now, extrapolated from the playback rate while playing. */
    get elapsed(): number {
        return this.#restoring ? this.#heldElapsed : this.#state.nowPlayingClient?.elapsedTime ?? 0;
    }

    readonly #remote: () => MediaRemote | undefined;
    readonly #state: MediaRemoteState;
    #artwork?: ArtworkParts;
    #deadline?: NodeJS.Timeout;
    #heldCommands: ReadonlySet<NowPlayingCommand> = new Set();
    #heldElapsed: number = 0;
    #last?: NowPlaying | null;
    #lastState: PlaybackState = 'unknown';

    /** Indexes of the artwork parts the current session reported; the others keep the announced value. */
    readonly #reported: Set<number> = new Set();

    #restoring: boolean = false;
    #settle?: NodeJS.Timeout;

    constructor(state: MediaRemoteState, remote: () => MediaRemote | undefined) {
        super();

        this.#remote = remote;
        this.#state = state;

        state.on('nowPlayingChanged', client => this.#onNowPlayingChanged(client));
        state.on('playbackStateChanged', client => this.#onPlaybackStateChanged(client));
        state.on('artworkChanged', client => this.#onArtworkChanged(client));
    }

    /** Checks whether the now-playing app accepts the command. During a restore it answers as the held item did. */
    supports(command: NowPlayingCommand): boolean {
        if (this.#restoring) {
            return this.#heldCommands.has(command);
        }

        return this.#state.nowPlayingClient?.isCommandSupported(COMMANDS[command]) ?? false;
    }

    /** Fetches the lyrics of the current item from the playback queue. */
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
     * Holds the announced values while the device clears the model for a new session. The hold lasts
     * until that session reports the same item, another item settled for {@link RESTORE_SETTLE}, or
     * {@link resume} timed out. The device calls it right before the clear.
     */
    hold(): void {
        if (!this.#restoring) {
            const client = this.#state.nowPlayingClient;

            this.#heldElapsed = client?.elapsedTime ?? 0;
            this.#heldCommands = new Set((Object.keys(COMMANDS) as NowPlayingCommand[]).filter(command => client?.isCommandSupported(COMMANDS[command]) ?? false));
        }

        this.#endRestore();
        this.#reported.clear();
        this.#restoring = this.#last !== undefined;
    }

    /**
     * Ends the restore within {@link RESTORE_TIMEOUT}, so a session that reports nothing does not
     * keep the held values. The device calls it once the new session is up.
     */
    resume(): void {
        if (!this.#restoring) {
            return;
        }

        clearTimeout(this.#deadline);
        this.#deadline = setTimeout(() => this.#settleRestore(), RESTORE_TIMEOUT);
        this.#deadline.unref();
    }

    /**
     * Cancels the pending restore timers, so nothing fires after the device disconnected. A restore
     * in flight keeps the held values until the next session reports. A disconnect calls it.
     */
    stop(): void {
        this.#clearTimers();
    }

    /**
     * Forgets what was announced, so the next session announces its item, state and artwork as a
     * new device would. A disconnect calls it once the sessions closed; a drop keeps the values.
     */
    reset(): void {
        this.#endRestore();
        this.#artwork = undefined;
        this.#heldCommands = new Set();
        this.#heldElapsed = 0;
        this.#last = undefined;
        this.#lastState = 'unknown';
        this.#reported.clear();
    }

    /**
     * Returns the artwork parts a consumer can see: its identifier, its URL and its bytes. A part
     * the current session has not reported yet keeps the announced value, so artwork that comes back
     * in pieces after a reconnect does not look like a change.
     */
    #artworkOf(client: Client | null): ArtworkParts {
        const parts = [client?.artworkId ?? null, client?.artworkUrl() ?? null, fingerprintOf(client?.currentItemArtwork), fingerprintOf(this.#state.artworkJpegData)];

        return parts.map((part, index) => {
            if (part !== null) {
                this.#reported.add(index);

                return part;
            }

            return this.#reported.has(index) ? null : this.#artwork?.[index] ?? null;
        });
    }

    #onArtworkChanged(client: Client): void {
        if (this.#restoring) {
            return;
        }

        const artwork = this.#artworkOf(client);

        if (sameArtwork(this.#artwork, artwork)) {
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
            this.#publish(item, client);

            return;
        }

        clearTimeout(this.#settle);
        this.#settle = setTimeout(() => this.#settleRestore(), RESTORE_SETTLE);
        this.#settle.unref();
    }

    /**
     * Announces a playback state change. During a restore the state belongs to the item that ends the
     * restore, so it waits for that item.
     */
    #onPlaybackStateChanged(client: Client): void {
        if (this.#restoring) {
            return;
        }

        const state = playbackStateOf(client.playbackState);
        const previous = this.#lastState;

        if (state === previous) {
            return;
        }

        this.#lastState = state;
        this.emit('state', state, previous, toNowPlaying(client));
    }

    #clearTimers(): void {
        clearTimeout(this.#settle);
        clearTimeout(this.#deadline);
        this.#settle = undefined;
        this.#deadline = undefined;
    }

    #endRestore(): void {
        this.#clearTimers();
        this.#restoring = false;
    }

    /** Ends the restore and announces what the model holds now, when it differs from the last announced. */
    #settleRestore(): void {
        this.#endRestore();

        const current = this.#state.nowPlayingClient;

        this.#publish(toNowPlaying(current), current);
    }

    /** Announces the item when it differs; a same item whose artwork changed announces the artwork instead. */
    #publish(item: NowPlaying | null, client: Client | null): void {
        if (sameItem(item, this.#last)) {
            const artwork = this.#artworkOf(client);

            if (item && !sameArtwork(this.#artwork, artwork)) {
                this.#artwork = artwork;
                this.emit('artwork', item);
            }

            return;
        }

        this.#last = item;
        this.#artwork = this.#artworkOf(client);

        // The model only reports a state change of the app that plays. A state that changed while the
        // app took over, or while the session was down, goes out here so `state` stays truthful.
        // Without an item no state goes out, so the next item announces its state as new.
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
