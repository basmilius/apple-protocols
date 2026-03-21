import { EventEmitter } from 'node:events';
import { type DataStream, Proto, type Protocol } from '@basmilius/apple-airplay';
import { PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Client from './client';
import type Device from './device';

type EventMap = {
    readonly clients: [Record<string, Client>];
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly deviceInfoUpdate: [Proto.DeviceInfoMessage];
    readonly originClientProperties: [Proto.OriginClientPropertiesMessage];
    readonly playerClientProperties: [Proto.PlayerClientPropertiesMessage];
    readonly removeClient: [Proto.RemoveClientMessage];
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
    get #dataStream(): DataStream {
        return this.#protocol.dataStream;
    }

    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    get clients(): Record<string, Client> {
        return this.#clients;
    }

    get nowPlayingClient(): Client | null {
        return this.#nowPlayingClientBundleIdentifier ? this.#clients[this.#nowPlayingClientBundleIdentifier] ?? null : null;
    }

    get outputDeviceUID(): string | null {
        return this.#outputDeviceUID;
    }

    get outputDevices(): Proto.AVOutputDeviceDescriptor[] {
        return this.#outputDevices;
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
    #outputDeviceUID: string | null;
    #outputDevices: Proto.AVOutputDeviceDescriptor[] = [];
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;

    constructor(device: Device) {
        super();

        this.#device = device;
        this.clear();

        this.onDeviceInfo = this.onDeviceInfo.bind(this);
        this.onDeviceInfoUpdate = this.onDeviceInfoUpdate.bind(this);
        this.onOriginClientProperties = this.onOriginClientProperties.bind(this);
        this.onPlayerClientProperties = this.onPlayerClientProperties.bind(this);
        this.onRemoveClient = this.onRemoveClient.bind(this);
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

    [STATE_SUBSCRIBE_SYMBOL](): void {
        this.#dataStream.on('deviceInfo', this.onDeviceInfo);
        this.#dataStream.on('deviceInfoUpdate', this.onDeviceInfoUpdate);
        this.#dataStream.on('originClientProperties', this.onOriginClientProperties);
        this.#dataStream.on('playerClientProperties', this.onPlayerClientProperties);
        this.#dataStream.on('removeClient', this.onRemoveClient);
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

    [STATE_UNSUBSCRIBE_SYMBOL](): void {
        const dataStream = this.#dataStream;

        if (!dataStream) {
            return;
        }

        dataStream.off('deviceInfo', this.onDeviceInfo);
        dataStream.off('deviceInfoUpdate', this.onDeviceInfoUpdate);
        dataStream.off('originClientProperties', this.onOriginClientProperties);
        dataStream.off('playerClientProperties', this.onPlayerClientProperties);
        dataStream.off('removeClient', this.onRemoveClient);
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
        this.#nowPlayingClientBundleIdentifier = null;
        this.#outputDeviceUID = null;
        this.#outputDevices = [];
        this.#volume = 0;
        this.#volumeAvailable = false;
        this.#volumeCapabilities = Proto.VolumeCapabilities_Enum.None;
    }

    onDeviceInfo(message: Proto.DeviceInfoMessage): void {
        if (message.clusterID) {
            this.#outputDeviceUID = message.clusterID;
        } else if (message.deviceUID) {
            this.#outputDeviceUID = message.deviceUID;
        } else if (message.uniqueIdentifier) {
            this.#outputDeviceUID = message.uniqueIdentifier;
        }

        this.emit('deviceInfo', message);
    }

    onDeviceInfoUpdate(message: Proto.DeviceInfoMessage): void {
        if (message.clusterID) {
            this.#outputDeviceUID = message.clusterID;
        } else if (message.deviceUID) {
            this.#outputDeviceUID = message.deviceUID;
        } else if (message.uniqueIdentifier) {
            this.#outputDeviceUID = message.uniqueIdentifier;
        }

        this.emit('deviceInfoUpdate', message);
    }

    onOriginClientProperties(message: Proto.OriginClientPropertiesMessage): void {
        this.emit('originClientProperties', message);
    }

    onPlayerClientProperties(message: Proto.PlayerClientPropertiesMessage): void {
        this.emit('playerClientProperties', message);
    }

    onRemoveClient(message: Proto.RemoveClientMessage): void {
        if (!(message.client.bundleIdentifier in this.#clients)) {
            return;
        }

        delete this.#clients[message.client.bundleIdentifier];

        this.emit('clients', this.#clients);
    }

    onSendCommandResult(message: Proto.SendCommandResultMessage): void {
        this.emit('sendCommandResult', message);
    }

    onSetArtwork(message: Proto.SetArtworkMessage): void {
        this.emit('setArtwork', message);
    }

    onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): void {
        this.emit('setDefaultSupportedCommands', message);
    }

    onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): void {
        this.#nowPlayingClientBundleIdentifier = message.client?.bundleIdentifier ?? null;

        this.emit('setNowPlayingClient', message);
    }

    onSetNowPlayingPlayer(message: Proto.SetNowPlayingPlayerMessage): void {
        this.emit('setNowPlayingPlayer', message);
    }

    onSetState(message: Proto.SetStateMessage): void {
        const client = this.#client(message.playerPath.client.bundleIdentifier, message.displayName);

        if (message.nowPlayingInfo) {
            client.setNowPlayingInfo(message.nowPlayingInfo);
        }

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

    onUpdateContentItem(message: Proto.UpdateContentItemMessage): void {
        const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);

        if (!client) {
            return;
        }

        for (const item of message.contentItems) {
            client.updateContentItem(item);
        }

        this.emit('updateContentItem', message);
    }

    onUpdateContentItemArtwork(message: Proto.UpdateContentItemArtworkMessage): void {
        this.emit('updateContentItemArtwork', message);
    }

    onUpdatePlayer(message: Proto.UpdatePlayerMessage): void {
        this.emit('updatePlayer', message);
    }

    onUpdateClient(message: Proto.UpdateClientMessage): void {
        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('clients', this.#clients);
    }

    onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): void {
        this.#outputDevices = message.outputDevices;

        this.emit('updateOutputDevice', message);
    }

    onVolumeControlAvailability(message: Proto.VolumeControlAvailabilityMessage): void {
        this.#volumeAvailable = message.volumeControlAvailable;
        this.#volumeCapabilities = message.volumeCapabilities;

        this.emit('volumeControlAvailability', message.volumeControlAvailable, message.volumeCapabilities);
    }

    onVolumeControlCapabilitiesDidChange(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
        this.#volumeAvailable = message.capabilities.volumeControlAvailable;
        this.#volumeCapabilities = message.capabilities.volumeCapabilities;

        this.emit('volumeControlCapabilitiesDidChange', message.capabilities.volumeControlAvailable, message.capabilities.volumeCapabilities);
    }

    onVolumeDidChange(message: Proto.VolumeDidChangeMessage): void {
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
