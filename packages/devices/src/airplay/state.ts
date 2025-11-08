import { EventEmitter } from 'node:events';
import type { AirPlay, AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import { AIRPLAY_PROTOCOL, AIRPLAY_STATE_SUBSCRIBE_SYMBOL, AIRPLAY_STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Client from './client';
import type Device from './device';

type EventMap = {
    readonly clients: [Record<string, Client>];
    readonly nowPlayingClient: [string | null];
    readonly setState: [Proto.SetStateMessage];
};

export default class extends EventEmitter<EventMap> {
    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
    }

    get #protocol(): AirPlay {
        return this.#device[AIRPLAY_PROTOCOL];
    }

    get clients(): Record<string, Client> {
        return this.#clients;
    }

    get nowPlayingClient(): Client | null {
        return this.#nowPlayingClientBundleIdentifier ? this.#clients[this.#nowPlayingClientBundleIdentifier] ?? null : null;
    }

    get nowPlayingClientBundleIdentifier(): string | null {
        return this.#nowPlayingClientBundleIdentifier;
    }

    readonly #clients: Record<string, Client> = {};
    readonly #device: Device;
    #nowPlayingClientBundleIdentifier: string;

    constructor(device: Device) {
        super();

        this.#device = device;
        this.#nowPlayingClientBundleIdentifier = null;

        this.onSetNowPlayingClient = this.onSetNowPlayingClient.bind(this);
        this.onSetState = this.onSetState.bind(this);
        this.onUpdateClient = this.onUpdateClient.bind(this);
    }

    async [AIRPLAY_STATE_SUBSCRIBE_SYMBOL](): Promise<void> {
        this.#dataStream.on('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.on('setState', this.onSetState);
        this.#dataStream.on('updateClient', this.onUpdateClient);
    }

    async [AIRPLAY_STATE_UNSUBSCRIBE_SYMBOL](): Promise<void> {
        this.#dataStream.off('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.off('setState', this.onSetState);
        this.#dataStream.off('updateClient', this.onUpdateClient);
    }

    async onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): Promise<void> {
        this.#nowPlayingClientBundleIdentifier = message.client.bundleIdentifier ?? null;

        this.emit('nowPlayingClient', this.#nowPlayingClientBundleIdentifier);
    }

    async onSetState(message: Proto.SetStateMessage): Promise<void> {
        const client = this.#client(message.playerPath.client.bundleIdentifier, message.displayName);

        if (message.playbackState) {
            client.setPlaybackState(message.playbackState, message.playbackStateTimestamp);
        }

        if (message.supportedCommands) {
            client.setSupportedCommands(message.supportedCommands.supportedCommands);
        }

        if (message.playbackQueue) {
            client.setPlaybackQueue(message.playbackQueue);
        }

        this.emit('setState', message);
    }

    async onUpdateClient(message: Proto.UpdateClientMessage): Promise<void> {
        this.#client(message.client.bundleIdentifier, message.client.displayName);
        this.emit('clients', this.#clients);
    }

    #client(bundleIdentifier: string, displayName: string): Client {
        if (bundleIdentifier in this.#clients) {
            return this.#clients[bundleIdentifier];
        } else {
            const client = new Client(bundleIdentifier, displayName);
            this.#clients[bundleIdentifier] = client;

            this.emit('clients', this.#clients);

            return client;
        }
    }
}
