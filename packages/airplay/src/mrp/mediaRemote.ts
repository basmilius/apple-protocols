import type { EventEmitter } from 'node:events';
import { ConnectionClosedError } from '@corewire/core';
import type { DataChannel } from '../channels/data';
import type { AirPlaySession } from '../session';
import { Artwork } from './artwork';
import type { MrpMessage, MrpMessageName } from './codec';
import { Commands } from './commands';
import { Hid } from './hid';
import { Keyboard } from './keyboard';
import * as Messages from './messages';
import { OutputDevices } from './outputDevices';
import { PlaybackQueue } from './playbackQueue';
import type { Player } from './player';
import { MediaRemoteState } from './state';
import { Volume } from './volume';

/** The messages the state derives something from. */
const STATE_MESSAGES: readonly MrpMessageName[] = [
    'configureConnection',
    'keyboard',
    'deviceInfo',
    'deviceInfoUpdate',
    'originClientProperties',
    'playerClientProperties',
    'removeClient',
    'removePlayer',
    'sendCommandResult',
    'sendLyricsEvent',
    'setArtwork',
    'setDefaultSupportedCommands',
    'setNowPlayingClient',
    'setNowPlayingPlayer',
    'setState',
    'updateClient',
    'updateContentItem',
    'updateContentItemArtwork',
    'updatePlayer',
    'playerClientParticipantsUpdate',
    'updateOutputDevice',
    'volumeControlAvailability',
    'volumeControlCapabilitiesDidChange',
    'volumeDidChange',
    'volumeMutedDidChange'
];

export type MediaRemoteOptions = {
    /**
     * The state to feed; a new one when omitted. Pass one to keep its listeners across sessions.
     * It is fed as it is: clear it yourself when a new session should start empty.
     */
    readonly state?: MediaRemoteState;
};

/**
 * Remote control of a receiver over MRP, on the data channel of an AirPlay session. It owns the
 * state the messages feed and the parts that send: keys, commands, volume, text input, output
 * devices, the playback queue and artwork. It lives as long as its session.
 */
export class MediaRemote {
    /** The MRP data channel this remote sends on. */
    get channel(): DataChannel {
        return this.#channel;
    }

    readonly artwork: Artwork;
    readonly commands: Commands;
    readonly hid: Hid;
    readonly keyboard: Keyboard;
    readonly outputDevices: OutputDevices;
    readonly playbackQueue: PlaybackQueue;
    readonly state: MediaRemoteState;
    readonly volume: Volume;

    readonly #channel: DataChannel;
    readonly #session: AirPlaySession;
    #lastArtworkId: string | null = null;

    /**
     * Opens remote control on the session and runs the MRP startup: DEVICE_INFO as an exchange,
     * then the connection state, the update subscription and GET_STATE, each sent without waiting.
     * The state listens from before the data channel connects, so it misses nothing the receiver
     * sends right away. A failed startup ends the session.
     *
     * @throws {SetupError} When a SETUP fails.
     * @throws {TimeoutError} When DEVICE_INFO gets no reply.
     * @throws {ConnectionClosedError} When the session ends during setup.
     */
    static async open(session: AirPlaySession, options: MediaRemoteOptions = {}): Promise<MediaRemote> {
        const state = options.state ?? new MediaRemoteState();
        let remote: MediaRemote | undefined;

        const {events} = await session.openRemoteControl({
            subscribe: data => {
                remote = new MediaRemote(session, data, state);
            }
        });

        try {
            await remote.#start();

            if (session.signal.aborted) {
                throw new ConnectionClosedError('AirPlay setup was interrupted.');
            }

            if (!session.control.isConnected || !remote.#channel.isConnected || !events.isConnected) {
                throw new ConnectionClosedError('An AirPlay stream closed during setup.');
            }
        } catch (err) {
            if (session.signal.aborted) {
                throw err instanceof ConnectionClosedError ? err : new ConnectionClosedError('AirPlay setup was interrupted.');
            }

            session.context.logger.error('[device]', 'Setup failed, cleaning up', err);
            await session.close();

            throw err;
        }

        session.context.logger.info('Protocol ready.');

        return remote;
    }

    /** Use {@link open}. */
    constructor(session: AirPlaySession, channel: DataChannel, state: MediaRemoteState) {
        this.#channel = channel;
        this.#session = session;
        this.state = state;

        this.hid = new Hid(channel, state);
        this.commands = new Commands(channel);
        this.volume = new Volume(channel, session.context, state, this.hid);
        this.keyboard = new Keyboard(channel);
        this.outputDevices = new OutputDevices(channel, state);
        this.playbackQueue = new PlaybackQueue(channel, state);
        this.artwork = new Artwork(state, this.playbackQueue);

        this.#feedState();
    }

    /** Wakes the receiver from sleep with a WAKE_DEVICE message. */
    async wake(): Promise<void> {
        this.#channel.send(Messages.wakeDevice());
    }

    /** Forwards every message the state tracks, until the session ends. */
    #feedState(): void {
        const signal = this.#session.signal;

        if (signal.aborted) {
            return;
        }

        // Each listener takes the extension of its own message; the typed map cannot express that for a list of names.
        const channel = this.#channel as unknown as EventEmitter;
        const listeners = STATE_MESSAGES.map(name => {
            const listener = (message: MrpMessage[1]): void => this.state.apply(...[name, message] as MrpMessage);

            channel.on(name, listener);

            return [name, listener] as const;
        });

        signal.addEventListener('abort', () => {
            for (const [name, listener] of listeners) {
                channel.off(name, listener);
            }
        }, {once: true});
    }

    /** Fetches the playback queue whenever the artwork changes, so its bytes or URL arrive. */
    #onNowPlayingChanged(player: Player | null): void {
        const artworkId = player?.artworkId ?? null;

        if (artworkId === this.#lastArtworkId) {
            return;
        }

        this.#lastArtworkId = artworkId;
        this.playbackQueue.request(1).catch(() => {});
    }

    async #start(): Promise<void> {
        const channel = this.#channel;

        await channel.exchange(Messages.deviceInfo(this.#session.pairingId, this.#session.context.identity));
        channel.send(Messages.setConnectionState());
        channel.send(Messages.clientUpdatesConfig(true, true, true, true));
        // The receiver answers with unidentified SET_STATE pushes, never with a reply to this identifier.
        channel.send(Messages.getState());

        const listener = (_client: unknown, player: Player | null): void => this.#onNowPlayingChanged(player);

        this.state.on('nowPlayingChanged', listener);
        this.#session.signal.addEventListener('abort', () => this.state.off('nowPlayingChanged', listener), {once: true});
    }
}
