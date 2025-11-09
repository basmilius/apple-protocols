import { EventEmitter } from 'node:events';
import type { AirPlay, AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import { PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Client from './client';
import type Device from './device';

type EventMap = {
    readonly clients: [Record<string, Client>];
    readonly nowPlayingClient: [string | null];
    readonly setState: [Proto.SetStateMessage];
    readonly volumeControlAvailability: [boolean, Proto.VolumeCapabilities_Enum];
    readonly volumeControlCapabilitiesDidChange: [boolean, Proto.VolumeCapabilities_Enum];
    readonly volumeDidChange: [number];
};

export default class extends EventEmitter<EventMap> {
    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
    }

    get #protocol(): AirPlay {
        return this.#device[PROTOCOL];
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

    get volume(): number {
        return this.#volume;
    }

    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    get volumeCapabilities(): Proto.VolumeCapabilities_Enum {
        return this.#volumeCapabilities;
    }

    readonly #clients: Record<string, Client> = {};
    readonly #device: Device;
    #nowPlayingClientBundleIdentifier: string;
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;

    constructor(device: Device) {
        super();

        this.#device = device;
        this.#nowPlayingClientBundleIdentifier = null;
        this.#volume = 0;

        this.onSetNowPlayingClient = this.onSetNowPlayingClient.bind(this);
        this.onSetState = this.onSetState.bind(this);
        this.onUpdateClient = this.onUpdateClient.bind(this);
        this.onVolumeControlAvailability = this.onVolumeControlAvailability.bind(this);
        this.onVolumeControlCapabilitiesDidChange = this.onVolumeControlCapabilitiesDidChange.bind(this);
        this.onVolumeDidChange = this.onVolumeDidChange.bind(this);
    }

    async [STATE_SUBSCRIBE_SYMBOL](): Promise<void> {
        this.#dataStream.on('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.on('setState', this.onSetState);
        this.#dataStream.on('updateClient', this.onUpdateClient);
        this.#dataStream.on('volumeControlAvailability', this.onVolumeControlAvailability);
        this.#dataStream.on('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        this.#dataStream.on('volumeDidChange', this.onVolumeDidChange);
    }

    async [STATE_UNSUBSCRIBE_SYMBOL](): Promise<void> {
        this.#dataStream.off('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.off('setState', this.onSetState);
        this.#dataStream.off('updateClient', this.onUpdateClient);
        this.#dataStream.off('volumeControlAvailability', this.onVolumeControlAvailability);
        this.#dataStream.off('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        this.#dataStream.off('volumeDidChange', this.onVolumeDidChange);
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

    async onVolumeControlAvailability(message: Proto.VolumeControlAvailabilityMessage): Promise<void> {
        this.#volumeAvailable = message.volumeControlAvailable;
        this.#volumeCapabilities = message.volumeCapabilities;

        this.emit('volumeControlAvailability', message.volumeControlAvailable, message.volumeCapabilities);
    }

    async onVolumeControlCapabilitiesDidChange(message: Proto.VolumeControlCapabilitiesDidChangeMessage): Promise<void> {
        this.#volumeAvailable = message.capabilities.volumeControlAvailable;
        this.#volumeCapabilities = message.capabilities.volumeCapabilities;

        this.emit('volumeControlCapabilitiesDidChange', message.capabilities.volumeControlAvailable, message.capabilities.volumeCapabilities);
    }

    async onVolumeDidChange(message: Proto.VolumeDidChangeMessage): Promise<void> {
        this.#volume = message.volume;

        this.emit('volumeDidChange', message.volume);
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
