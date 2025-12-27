import { EventEmitter } from 'node:events';
import { type AirPlay, type AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import { PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Client from './client';
import type Device from './device';

type EventMap = {
    readonly clients: [Record<string, Client>];
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly originClientProperties: [Proto.OriginClientPropertiesMessage];
    readonly playerClientProperties: [Proto.PlayerClientPropertiesMessage];
    readonly sendCommandResult: [Proto.SendCommandResultMessage];
    readonly setArtwork: [Proto.SetArtworkMessage];
    readonly setDefaultSupportedCommands: [Proto.SetDefaultSupportedCommandsMessage];
    readonly setNowPlayingClient: [Proto.SetNowPlayingClientMessage];
    readonly setNowPlayingPlayer: [Proto.SetNowPlayingPlayerMessage];
    readonly setState: [Proto.SetStateMessage];
    readonly updateClient: [Proto.UpdateClientMessage];
    readonly updateContentItem: [Proto.UpdateContentItemMessage];
    readonly updateContentItemArtwork: [Proto.UpdateContentItemArtworkMessage];
    readonly updatePlayer: [Proto.UpdatePlayerMessage];
    readonly updateOutputDevice: [Proto.UpdateOutputDeviceMessage];
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

    get volume(): number {
        return this.#volume;
    }

    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    get volumeCapabilities(): Proto.VolumeCapabilities_Enum {
        return this.#volumeCapabilities;
    }

    readonly #device: Device;
    #clients: Record<string, Client>;
    #nowPlayingClientBundleIdentifier: string | null;
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;

    constructor(device: Device) {
        super();

        this.#device = device;
        this.clear();

        this.onDeviceInfo = this.onDeviceInfo.bind(this);
        this.onOriginClientProperties = this.onOriginClientProperties.bind(this);
        this.onPlayerClientProperties = this.onPlayerClientProperties.bind(this);
        this.onSendCommandResult = this.onSendCommandResult.bind(this);
        this.onSetArtwork = this.onSetArtwork.bind(this);
        this.onSetDefaultSupportedCommands = this.onSetDefaultSupportedCommands.bind(this);
        this.onSetNowPlayingClient = this.onSetNowPlayingClient.bind(this);
        this.onSetNowPlayingPlayer = this.onSetNowPlayingPlayer.bind(this);
        this.onSetState = this.onSetState.bind(this);
        this.onUpdateClient = this.onUpdateClient.bind(this);
        this.onUpdateContentItem = this.onUpdateContentItem.bind(this);
        this.onUpdateContentItemArtwork = this.onUpdateContentItemArtwork.bind(this);
        this.onUpdatePlayer = this.onUpdatePlayer.bind(this);
        this.onUpdateOutputDevice = this.onUpdateOutputDevice.bind(this);
        this.onVolumeControlAvailability = this.onVolumeControlAvailability.bind(this);
        this.onVolumeControlCapabilitiesDidChange = this.onVolumeControlCapabilitiesDidChange.bind(this);
        this.onVolumeDidChange = this.onVolumeDidChange.bind(this);
    }

    async [STATE_SUBSCRIBE_SYMBOL](): Promise<void> {
        this.#dataStream.on('deviceInfo', this.onDeviceInfo);
        this.#dataStream.on('originClientProperties', this.onOriginClientProperties);
        this.#dataStream.on('playerClientProperties', this.onPlayerClientProperties);
        this.#dataStream.on('sendCommandResult', this.onSendCommandResult);
        this.#dataStream.on('setArtwork', this.onSetArtwork);
        this.#dataStream.on('setDefaultSupportedCommands', this.onSetDefaultSupportedCommands);
        this.#dataStream.on('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.on('setNowPlayingPlayer', this.onSetNowPlayingPlayer);
        this.#dataStream.on('setState', this.onSetState);
        this.#dataStream.on('updateClient', this.onUpdateClient);
        this.#dataStream.on('updateContentItem', this.onUpdateContentItem);
        this.#dataStream.on('updateContentItemArtwork', this.onUpdateContentItemArtwork);
        this.#dataStream.on('updatePlayer', this.onUpdatePlayer);
        this.#dataStream.on('updateOutputDevice', this.onUpdateOutputDevice);
        this.#dataStream.on('volumeControlAvailability', this.onVolumeControlAvailability);
        this.#dataStream.on('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        this.#dataStream.on('volumeDidChange', this.onVolumeDidChange);
    }

    async [STATE_UNSUBSCRIBE_SYMBOL](): Promise<void> {
        const dataStream = this.#dataStream;

        if (!dataStream) {
            return;
        }

        dataStream.off('deviceInfo', this.onDeviceInfo);
        dataStream.off('originClientProperties', this.onOriginClientProperties);
        dataStream.off('playerClientProperties', this.onPlayerClientProperties);
        dataStream.off('sendCommandResult', this.onSendCommandResult);
        dataStream.off('setArtwork', this.onSetArtwork);
        dataStream.off('setDefaultSupportedCommands', this.onSetDefaultSupportedCommands);
        dataStream.off('setNowPlayingClient', this.onSetNowPlayingClient);
        dataStream.off('setNowPlayingPlayer', this.onSetNowPlayingPlayer);
        dataStream.off('setState', this.onSetState);
        dataStream.off('updateClient', this.onUpdateClient);
        dataStream.off('updateContentItem', this.onUpdateContentItem);
        dataStream.off('updateContentItemArtwork', this.onUpdateContentItemArtwork);
        dataStream.off('updatePlayer', this.onUpdatePlayer);
        dataStream.off('updateOutputDevice', this.onUpdateOutputDevice);
        dataStream.off('volumeControlAvailability', this.onVolumeControlAvailability);
        dataStream.off('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        dataStream.off('volumeDidChange', this.onVolumeDidChange);
    }

    clear(): void {
        this.#clients = {};
        this.#nowPlayingClientBundleIdentifier = undefined;
        this.#volume = 0;
        this.#volumeAvailable = false;
        this.#volumeCapabilities = Proto.VolumeCapabilities_Enum.None;
    }

    async onDeviceInfo(message: Proto.DeviceInfoMessage): Promise<void> {
        this.emit('deviceInfo', message);
    }

    async onOriginClientProperties(message: Proto.OriginClientPropertiesMessage): Promise<void> {
        this.emit('originClientProperties', message);
    }

    async onPlayerClientProperties(message: Proto.PlayerClientPropertiesMessage): Promise<void> {
        this.emit('playerClientProperties', message);
    }

    async onSendCommandResult(message: Proto.SendCommandResultMessage): Promise<void> {
        this.emit('sendCommandResult', message);
    }

    async onSetArtwork(message: Proto.SetArtworkMessage): Promise<void> {
        this.emit('setArtwork', message);
    }

    async onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): Promise<void> {
        this.emit('setDefaultSupportedCommands', message);
    }

    async onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): Promise<void> {
        this.#nowPlayingClientBundleIdentifier = message.client?.bundleIdentifier ?? null;

        this.emit('setNowPlayingClient', message);
    }

    async onSetNowPlayingPlayer(message: Proto.SetNowPlayingPlayerMessage): Promise<void> {
        this.emit('setNowPlayingPlayer', message);
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

    async onUpdateContentItem(message: Proto.UpdateContentItemMessage): Promise<void> {
        const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);

        if (!client) {
            return;
        }

        for (const item of message.contentItems) {
            client.updateContentItem(item);
        }

        this.emit('updateContentItem', message);
    }

    async onUpdateContentItemArtwork(message: Proto.UpdateContentItemArtworkMessage): Promise<void> {
        this.emit('updateContentItemArtwork', message);
    }

    async onUpdatePlayer(message: Proto.UpdatePlayerMessage): Promise<void> {
        this.emit('updatePlayer', message);
    }

    async onUpdateClient(message: Proto.UpdateClientMessage): Promise<void> {
        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('clients', this.#clients);
    }

    async onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): Promise<void> {
        this.emit('updateOutputDevice', message);
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
