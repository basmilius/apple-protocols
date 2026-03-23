import { EventEmitter } from 'node:events';
import { type DataStream, Proto, type Protocol } from '@basmilius/apple-airplay';
import { PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Client from './client';
import type Device from './device';
import type Player from './player';
import { DEFAULT_PLAYER_ID } from './player';

type NowPlayingSnapshot = {
    bundleIdentifier: string | null;
    playerIdentifier: string | null;
    playbackState: Proto.PlaybackState_Enum;
    title: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
    shuffleMode: Proto.ShuffleMode_Enum;
    repeatMode: Proto.RepeatMode_Enum;
    mediaType: Proto.ContentItemMetadata_MediaType;
    seriesName: string;
    seasonNumber: number;
    episodeNumber: number;
    contentIdentifier: string;
    artworkId: string | null;
    hasArtworkUrl: boolean;
    hasArtworkData: boolean;
};

type EventMap = {
    readonly clients: [Record<string, Client>];
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly deviceInfoUpdate: [Proto.DeviceInfoMessage];
    readonly keyboard: [Proto.KeyboardMessage];
    readonly nowPlayingChanged: [client: Client | null, player: Player | null];
    readonly originClientProperties: [Proto.OriginClientPropertiesMessage];
    readonly playerClientProperties: [Proto.PlayerClientPropertiesMessage];
    readonly removeClient: [Proto.RemoveClientMessage];
    readonly removePlayer: [Proto.RemovePlayerMessage];
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

    get isKeyboardActive(): boolean {
        return this.#keyboardState === Proto.KeyboardState_Enum.DidBeginEditing
            || this.#keyboardState === Proto.KeyboardState_Enum.Editing
            || this.#keyboardState === Proto.KeyboardState_Enum.TextDidChange;
    }

    get keyboardAttributes(): Proto.TextEditingAttributes | null {
        return this.#keyboardAttributes;
    }

    get keyboardState(): Proto.KeyboardState_Enum {
        return this.#keyboardState;
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

    get clusterID(): string | null {
        return this.#clusterID;
    }

    get clusterType(): number {
        return this.#clusterType;
    }

    get isClusterAware(): boolean {
        return this.#isClusterAware;
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
    #keyboardAttributes: Proto.TextEditingAttributes | null;
    #keyboardState: Proto.KeyboardState_Enum;
    #nowPlayingClientBundleIdentifier: string | null;
    #nowPlayingSnapshot: NowPlayingSnapshot | null;
    #outputDeviceUID: string | null;
    #outputDevices: Proto.AVOutputDeviceDescriptor[] = [];
    #clusterID: string | null;
    #clusterType: number;
    #isClusterAware: boolean;
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;

    constructor(device: Device) {
        super();

        this.#device = device;
        this.clear();

        this.onKeyboard = this.onKeyboard.bind(this);
        this.onDeviceInfo = this.onDeviceInfo.bind(this);
        this.onDeviceInfoUpdate = this.onDeviceInfoUpdate.bind(this);
        this.onOriginClientProperties = this.onOriginClientProperties.bind(this);
        this.onPlayerClientProperties = this.onPlayerClientProperties.bind(this);
        this.onRemoveClient = this.onRemoveClient.bind(this);
        this.onRemovePlayer = this.onRemovePlayer.bind(this);
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
        this.#dataStream.on('keyboard', this.onKeyboard);
        this.#dataStream.on('deviceInfo', this.onDeviceInfo);
        this.#dataStream.on('deviceInfoUpdate', this.onDeviceInfoUpdate);
        this.#dataStream.on('originClientProperties', this.onOriginClientProperties);
        this.#dataStream.on('playerClientProperties', this.onPlayerClientProperties);
        this.#dataStream.on('removeClient', this.onRemoveClient);
        this.#dataStream.on('removePlayer', this.onRemovePlayer);
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

        dataStream.off('keyboard', this.onKeyboard);
        dataStream.off('deviceInfo', this.onDeviceInfo);
        dataStream.off('deviceInfoUpdate', this.onDeviceInfoUpdate);
        dataStream.off('originClientProperties', this.onOriginClientProperties);
        dataStream.off('playerClientProperties', this.onPlayerClientProperties);
        dataStream.off('removeClient', this.onRemoveClient);
        dataStream.off('removePlayer', this.onRemovePlayer);
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
        this.#keyboardAttributes = null;
        this.#keyboardState = Proto.KeyboardState_Enum.Unknown;
        this.#nowPlayingClientBundleIdentifier = null;
        this.#nowPlayingSnapshot = null;
        this.#outputDeviceUID = null;
        this.#outputDevices = [];
        this.#clusterID = null;
        this.#clusterType = 0;
        this.#isClusterAware = false;
        this.#volume = 0;
        this.#volumeAvailable = false;
        this.#volumeCapabilities = Proto.VolumeCapabilities_Enum.None;
    }

    onKeyboard(message: Proto.KeyboardMessage): void {
        this.#keyboardState = message.state;
        this.#keyboardAttributes = message.attributes ?? null;

        this.emit('keyboard', message);
    }

    onDeviceInfo(message: Proto.DeviceInfoMessage): void {
        this.#updateOutputDeviceUID(message);
        this.emit('deviceInfo', message);
    }

    onDeviceInfoUpdate(message: Proto.DeviceInfoMessage): void {
        this.#updateOutputDeviceUID(message);
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

        const wasActive = this.#nowPlayingClientBundleIdentifier === message.client.bundleIdentifier;

        delete this.#clients[message.client.bundleIdentifier];

        if (wasActive) {
            this.#nowPlayingClientBundleIdentifier = null;
        }

        this.emit('removeClient', message);
        this.emit('clients', this.#clients);

        if (wasActive) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    onSendCommandResult(message: Proto.SendCommandResultMessage): void {
        this.emit('sendCommandResult', message);
    }

    onSetArtwork(message: Proto.SetArtworkMessage): void {
        this.emit('setArtwork', message);
    }

    onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.supportedCommands) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.setDefaultSupportedCommands(message.supportedCommands.supportedCommands);
        }

        this.emit('setDefaultSupportedCommands', message);
    }

    onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): void {
        this.#nowPlayingClientBundleIdentifier = message.client?.bundleIdentifier ?? null;

        if (message.client?.bundleIdentifier && message.client?.displayName) {
            this.#client(message.client.bundleIdentifier, message.client.displayName);
        }

        this.emit('setNowPlayingClient', message);
        this.#emitNowPlayingChangedIfNeeded();
    }

    onSetNowPlayingPlayer(message: Proto.SetNowPlayingPlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.getOrCreatePlayer(message.playerPath.player.identifier, message.playerPath.player.displayName);
            client.setActivePlayer(message.playerPath.player.identifier);
        }

        this.emit('setNowPlayingPlayer', message);
        this.#emitNowPlayingChangedIfNeeded();
    }

    onSetState(message: Proto.SetStateMessage): void {
        const bundleIdentifier = message.playerPath.client.bundleIdentifier;
        const client = this.#client(bundleIdentifier, message.displayName);
        const playerIdentifier = message.playerPath?.player?.identifier || DEFAULT_PLAYER_ID;
        const player = client.getOrCreatePlayer(playerIdentifier, message.playerPath?.player?.displayName);

        if (message.nowPlayingInfo) {
            player.setNowPlayingInfo(message.nowPlayingInfo);
        }

        if (message.playbackState) {
            player.setPlaybackState(message.playbackState, message.playbackStateTimestamp);
        }

        if (message.supportedCommands) {
            player.setSupportedCommands(message.supportedCommands.supportedCommands);
        }

        if (message.playbackQueue) {
            player.setPlaybackQueue(message.playbackQueue);
        }

        this.emit('setState', message);

        if (bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    onUpdateContentItem(message: Proto.UpdateContentItemMessage): void {
        const bundleIdentifier = message.playerPath.client.bundleIdentifier;
        const client = this.#client(bundleIdentifier, message.playerPath.client.displayName);
        const playerIdentifier = message.playerPath?.player?.identifier || DEFAULT_PLAYER_ID;
        const player = client.getOrCreatePlayer(playerIdentifier, message.playerPath?.player?.displayName);

        for (const item of message.contentItems) {
            player.updateContentItem(item);
        }

        this.emit('updateContentItem', message);

        if (bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    onUpdateContentItemArtwork(message: Proto.UpdateContentItemArtworkMessage): void {
        this.emit('updateContentItemArtwork', message);
    }

    onUpdatePlayer(message: Proto.UpdatePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.getOrCreatePlayer(message.playerPath.player.identifier, message.playerPath.player.displayName);
        }

        this.emit('updatePlayer', message);
    }

    onRemovePlayer(message: Proto.RemovePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#clients[message.playerPath.client.bundleIdentifier];

            if (client) {
                client.removePlayer(message.playerPath.player.identifier);
            }
        }

        this.emit('removePlayer', message);

        if (message.playerPath?.client?.bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    onUpdateClient(message: Proto.UpdateClientMessage): void {
        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('updateClient', message);
        this.emit('clients', this.#clients);
    }

    onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): void {
        this.#outputDevices = message.clusterAwareOutputDevices?.length > 0
            ? message.clusterAwareOutputDevices
            : message.outputDevices;

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

    #updateOutputDeviceUID(message: Proto.DeviceInfoMessage): void {
        this.#outputDeviceUID = message.clusterID || message.deviceUID || message.uniqueIdentifier || null;
        this.#clusterID = message.clusterID || null;
        this.#clusterType = message.clusterType ?? 0;
        this.#isClusterAware = message.isClusterAware ?? false;
    }

    #client(bundleIdentifier: string, displayName: string): Client {
        if (bundleIdentifier in this.#clients) {
            const client = this.#clients[bundleIdentifier];

            if (displayName) {
                client.updateDisplayName(displayName);
            }

            return client;
        } else {
            const client = new Client(bundleIdentifier, displayName);
            this.#clients[bundleIdentifier] = client;

            this.emit('clients', this.#clients);

            return client;
        }
    }

    #createNowPlayingSnapshot(): NowPlayingSnapshot {
        const client = this.nowPlayingClient;
        const player = client?.activePlayer ?? null;

        return {
            bundleIdentifier: client?.bundleIdentifier ?? null,
            playerIdentifier: player?.identifier ?? null,
            playbackState: player?.playbackState ?? Proto.PlaybackState_Enum.Unknown,
            title: player?.title ?? '',
            artist: player?.artist ?? '',
            album: player?.album ?? '',
            genre: player?.genre ?? '',
            duration: player?.duration ?? 0,
            shuffleMode: player?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown,
            repeatMode: player?.repeatMode ?? Proto.RepeatMode_Enum.Unknown,
            mediaType: player?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType,
            seriesName: player?.seriesName ?? '',
            seasonNumber: player?.seasonNumber ?? 0,
            episodeNumber: player?.episodeNumber ?? 0,
            contentIdentifier: player?.contentIdentifier ?? '',
            artworkId: player?.artworkId ?? null,
            hasArtworkUrl: player?.artworkUrl() != null,
            hasArtworkData: player?.currentItemArtwork != null
        };
    }

    #emitNowPlayingChangedIfNeeded(): void {
        const snapshot = this.#createNowPlayingSnapshot();
        const previous = this.#nowPlayingSnapshot;

        if (previous && this.#snapshotsEqual(previous, snapshot)) {
            return;
        }

        this.#nowPlayingSnapshot = snapshot;

        const client = this.nowPlayingClient;
        this.emit('nowPlayingChanged', client, client?.activePlayer ?? null);
    }

    #snapshotsEqual(a: NowPlayingSnapshot, b: NowPlayingSnapshot): boolean {
        return a.bundleIdentifier === b.bundleIdentifier
            && a.playerIdentifier === b.playerIdentifier
            && a.playbackState === b.playbackState
            && a.title === b.title
            && a.artist === b.artist
            && a.album === b.album
            && a.genre === b.genre
            && a.duration === b.duration
            && a.shuffleMode === b.shuffleMode
            && a.repeatMode === b.repeatMode
            && a.mediaType === b.mediaType
            && a.seriesName === b.seriesName
            && a.seasonNumber === b.seasonNumber
            && a.episodeNumber === b.episodeNumber
            && a.contentIdentifier === b.contentIdentifier
            && a.artworkId === b.artworkId
            && a.hasArtworkUrl === b.hasArtworkUrl
            && a.hasArtworkData === b.hasArtworkData;
    }
}
