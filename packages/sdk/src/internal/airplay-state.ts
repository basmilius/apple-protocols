import { EventEmitter } from 'node:events';
import { type DataStream, Proto, type Protocol } from '@basmilius/apple-airplay';
import { PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import { AirPlayClient } from './airplay-client';
import type { AirPlayManager } from './airplay-manager';
import { type AirPlayPlayer, DEFAULT_PLAYER_ID } from './airplay-player';

/**
 * Snapshot of the current now-playing state, used for change detection.
 * Compared field-by-field to avoid emitting redundant 'nowPlayingChanged' events
 * when nothing meaningful has changed.
 */
type NowPlayingSnapshot = {
    bundleIdentifier: string | null;
    playerIdentifier: string | null;
    playbackState: Proto.PlaybackState_Enum;
    title: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
    playbackRate: number;
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
    isAlwaysLive: boolean;
    isAdvertisement: boolean;
};

/**
 * Events emitted by AirPlayState.
 *
 * Low-level events mirror DataStream protocol messages 1:1.
 * High-level events (activePlayerChanged, artworkChanged, etc.) provide
 * pre-resolved Client/Player references for convenience.
 */
type EventMap = {
    readonly clients: [Record<string, AirPlayClient>];
    readonly configureConnection: [Proto.ConfigureConnectionMessage];
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly deviceInfoUpdate: [Proto.DeviceInfoMessage];
    readonly keyboard: [Proto.KeyboardMessage];
    readonly nowPlayingChanged: [client: AirPlayClient | null, player: AirPlayPlayer | null];
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
    readonly volumeMutedDidChange: [boolean];

    // Granular high-level events (like Apple's NowPlayingController delegate callbacks)
    readonly activePlayerChanged: [client: AirPlayClient | null, player: AirPlayPlayer | null];
    readonly artworkChanged: [client: AirPlayClient, player: AirPlayPlayer];
    readonly lyricsEvent: [event: Proto.LyricsEvent, playerPath: Proto.PlayerPath | undefined];
    readonly playbackQueueChanged: [client: AirPlayClient, player: AirPlayPlayer];
    readonly playbackStateChanged: [client: AirPlayClient, player: AirPlayPlayer, oldState: Proto.PlaybackState_Enum, newState: Proto.PlaybackState_Enum];
    readonly supportedCommandsChanged: [client: AirPlayClient, player: AirPlayPlayer, commands: Proto.CommandInfo[]];
    readonly clusterChanged: [clusterID: string | null, isLeader: boolean];
    readonly playerClientParticipantsUpdate: [Proto.PlayerClientParticipantsUpdateMessage];
};

/**
 * Tracks the complete state of an AirPlay device: clients, players, now-playing,
 * volume, keyboard, output devices, and cluster info.
 * Listens to DataStream protocol messages and emits both low-level (1:1 with protocol)
 * and high-level (deduplicated, resolved) events.
 */
export class AirPlayState extends EventEmitter<EventMap> {
    /** @returns The DataStream for event subscription. */
    get #dataStream(): DataStream {
        return this.#protocol.dataStream;
    }

    /** @returns The underlying AirPlay Protocol instance. */
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    /** All known clients (apps) keyed by bundle identifier. */
    get clients(): Record<string, AirPlayClient> {
        return this.#clients;
    }

    /** Whether a keyboard/text input session is currently active on the Apple TV. */
    get isKeyboardActive(): boolean {
        return this.#keyboardState === Proto.KeyboardState_Enum.DidBeginEditing
            || this.#keyboardState === Proto.KeyboardState_Enum.Editing
            || this.#keyboardState === Proto.KeyboardState_Enum.TextDidChange;
    }

    /** Text editing attributes for the active keyboard session, or null. */
    get keyboardAttributes(): Proto.TextEditingAttributes | null {
        return this.#keyboardAttributes;
    }

    /** Current keyboard state enum value. */
    get keyboardState(): Proto.KeyboardState_Enum {
        return this.#keyboardState;
    }

    /** The currently active now-playing client, or null if nothing is playing. */
    get nowPlayingClient(): AirPlayClient | null {
        return this.#nowPlayingClientBundleIdentifier ? this.#clients[this.#nowPlayingClientBundleIdentifier] ?? null : null;
    }

    /** UID of the primary output device (used for volume control and multi-room). */
    get outputDeviceUID(): string | null {
        return this.#outputDeviceUID;
    }

    /** List of all output device descriptors in the current AirPlay group. */
    get outputDevices(): Proto.AVOutputDeviceDescriptor[] {
        return this.#outputDevices;
    }

    /** Cluster identifier for multi-room groups, or null. */
    get clusterID(): string | null {
        return this.#clusterID;
    }

    /** Cluster type code (0 if not clustered). */
    get clusterType(): number {
        return this.#clusterType;
    }

    /** Whether this device is aware of multi-room clusters. */
    get isClusterAware(): boolean {
        return this.#isClusterAware;
    }

    /** Whether this device is the leader of its multi-room cluster. */
    get isClusterLeader(): boolean {
        return this.#isClusterLeader;
    }

    /** Current playback queue participants (e.g. SharePlay users). */
    get participants(): Proto.PlaybackQueueParticipant[] {
        return this.#participants;
    }

    /** Raw JPEG artwork data from the last SET_ARTWORK_MESSAGE, or null. */
    get artworkJpegData(): Uint8Array | null {
        return this.#artworkJpegData;
    }

    /** Current volume level (0.0 - 1.0). */
    get volume(): number {
        return this.#volume;
    }

    /** Whether volume control is available on this device. */
    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    /** Volume capabilities (absolute, relative, both, or none). */
    get volumeCapabilities(): Proto.VolumeCapabilities_Enum {
        return this.#volumeCapabilities;
    }

    /** Whether the device is currently muted. */
    get volumeMuted(): boolean {
        return this.#volumeMuted;
    }

    readonly #device: AirPlayManager;
    #clients: Record<string, AirPlayClient>;
    #keyboardAttributes: Proto.TextEditingAttributes | null;
    #keyboardState: Proto.KeyboardState_Enum;
    #nowPlayingClientBundleIdentifier: string | null;
    #nowPlayingSnapshot: NowPlayingSnapshot | null;
    #outputDeviceUID: string | null;
    #outputDevices: Proto.AVOutputDeviceDescriptor[] = [];
    #clusterID: string | null;
    #clusterType: number;
    #isClusterAware: boolean;
    #isClusterLeader: boolean;
    #participants: Proto.PlaybackQueueParticipant[];
    #artworkJpegData: Uint8Array | null;
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;
    #volumeMuted: boolean;

    /**
     * Creates a new AirPlayState tracker.
     *
     * @param device - The AirPlay device to track state for.
     */
    constructor(device: AirPlayManager) {
        super();

        this.#device = device;
        this.clear();

        this.onConfigureConnection = this.onConfigureConnection.bind(this);
        this.onKeyboard = this.onKeyboard.bind(this);
        this.onDeviceInfo = this.onDeviceInfo.bind(this);
        this.onDeviceInfoUpdate = this.onDeviceInfoUpdate.bind(this);
        this.onOriginClientProperties = this.onOriginClientProperties.bind(this);
        this.onPlayerClientProperties = this.onPlayerClientProperties.bind(this);
        this.onRemoveClient = this.onRemoveClient.bind(this);
        this.onRemovePlayer = this.onRemovePlayer.bind(this);
        this.onSendCommandResult = this.onSendCommandResult.bind(this);
        this.onSendLyricsEvent = this.onSendLyricsEvent.bind(this);
        this.onSetArtwork = this.onSetArtwork.bind(this);
        this.onSetDefaultSupportedCommands = this.onSetDefaultSupportedCommands.bind(this);
        this.onSetNowPlayingClient = this.onSetNowPlayingClient.bind(this);
        this.onSetNowPlayingPlayer = this.onSetNowPlayingPlayer.bind(this);
        this.onSetState = this.onSetState.bind(this);
        this.onUpdateClient = this.onUpdateClient.bind(this);
        this.onUpdateContentItem = this.onUpdateContentItem.bind(this);
        this.onUpdateContentItemArtwork = this.onUpdateContentItemArtwork.bind(this);
        this.onUpdatePlayer = this.onUpdatePlayer.bind(this);
        this.onPlayerClientParticipantsUpdate = this.onPlayerClientParticipantsUpdate.bind(this);
        this.onUpdateOutputDevice = this.onUpdateOutputDevice.bind(this);
        this.onVolumeControlAvailability = this.onVolumeControlAvailability.bind(this);
        this.onVolumeControlCapabilitiesDidChange = this.onVolumeControlCapabilitiesDidChange.bind(this);
        this.onVolumeDidChange = this.onVolumeDidChange.bind(this);
        this.onVolumeMutedDidChange = this.onVolumeMutedDidChange.bind(this);
    }

    /** Subscribes to all DataStream events to track device state. Called internally via symbol. */
    [STATE_SUBSCRIBE_SYMBOL](): void {
        this.#dataStream.on('configureConnection', this.onConfigureConnection);
        this.#dataStream.on('keyboard', this.onKeyboard);
        this.#dataStream.on('deviceInfo', this.onDeviceInfo);
        this.#dataStream.on('deviceInfoUpdate', this.onDeviceInfoUpdate);
        this.#dataStream.on('originClientProperties', this.onOriginClientProperties);
        this.#dataStream.on('playerClientProperties', this.onPlayerClientProperties);
        this.#dataStream.on('removeClient', this.onRemoveClient);
        this.#dataStream.on('removePlayer', this.onRemovePlayer);
        this.#dataStream.on('sendCommandResult', this.onSendCommandResult);
        this.#dataStream.on('sendLyricsEvent', this.onSendLyricsEvent);
        this.#dataStream.on('setArtwork', this.onSetArtwork);
        this.#dataStream.on('setDefaultSupportedCommands', this.onSetDefaultSupportedCommands);
        this.#dataStream.on('setNowPlayingClient', this.onSetNowPlayingClient);
        this.#dataStream.on('setNowPlayingPlayer', this.onSetNowPlayingPlayer);
        this.#dataStream.on('setState', this.onSetState);
        this.#dataStream.on('updateClient', this.onUpdateClient);
        this.#dataStream.on('updateContentItem', this.onUpdateContentItem);
        this.#dataStream.on('updateContentItemArtwork', this.onUpdateContentItemArtwork);
        this.#dataStream.on('updatePlayer', this.onUpdatePlayer);
        this.#dataStream.on('playerClientParticipantsUpdate', this.onPlayerClientParticipantsUpdate);
        this.#dataStream.on('updateOutputDevice', this.onUpdateOutputDevice);
        this.#dataStream.on('volumeControlAvailability', this.onVolumeControlAvailability);
        this.#dataStream.on('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        this.#dataStream.on('volumeDidChange', this.onVolumeDidChange);
        this.#dataStream.on('volumeMutedDidChange', this.onVolumeMutedDidChange);
    }

    /** Unsubscribes from all DataStream events. Called internally via symbol. */
    [STATE_UNSUBSCRIBE_SYMBOL](): void {
        const dataStream = this.#dataStream;

        if (!dataStream) {
            return;
        }

        dataStream.off('configureConnection', this.onConfigureConnection);
        dataStream.off('keyboard', this.onKeyboard);
        dataStream.off('deviceInfo', this.onDeviceInfo);
        dataStream.off('deviceInfoUpdate', this.onDeviceInfoUpdate);
        dataStream.off('originClientProperties', this.onOriginClientProperties);
        dataStream.off('playerClientProperties', this.onPlayerClientProperties);
        dataStream.off('removeClient', this.onRemoveClient);
        dataStream.off('removePlayer', this.onRemovePlayer);
        dataStream.off('sendCommandResult', this.onSendCommandResult);
        dataStream.off('sendLyricsEvent', this.onSendLyricsEvent);
        dataStream.off('setArtwork', this.onSetArtwork);
        dataStream.off('setDefaultSupportedCommands', this.onSetDefaultSupportedCommands);
        dataStream.off('setNowPlayingClient', this.onSetNowPlayingClient);
        dataStream.off('setNowPlayingPlayer', this.onSetNowPlayingPlayer);
        dataStream.off('setState', this.onSetState);
        dataStream.off('updateClient', this.onUpdateClient);
        dataStream.off('updateContentItem', this.onUpdateContentItem);
        dataStream.off('updateContentItemArtwork', this.onUpdateContentItemArtwork);
        dataStream.off('updatePlayer', this.onUpdatePlayer);
        dataStream.off('playerClientParticipantsUpdate', this.onPlayerClientParticipantsUpdate);
        dataStream.off('updateOutputDevice', this.onUpdateOutputDevice);
        dataStream.off('volumeControlAvailability', this.onVolumeControlAvailability);
        dataStream.off('volumeControlCapabilitiesDidChange', this.onVolumeControlCapabilitiesDidChange);
        dataStream.off('volumeDidChange', this.onVolumeDidChange);
        dataStream.off('volumeMutedDidChange', this.onVolumeMutedDidChange);
    }

    /** Resets all state to initial/default values. Called on connect and reconnect. */
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
        this.#isClusterLeader = false;
        this.#participants = [];
        this.#artworkJpegData = null;
        this.#volume = 0;
        this.#volumeAvailable = false;
        this.#volumeCapabilities = Proto.VolumeCapabilities_Enum.None;
        this.#volumeMuted = false;
    }

    /**
     * Handles a ConfigureConnection message from the Apple TV.
     *
     * @param message - The configure connection message.
     */
    onConfigureConnection(message: Proto.ConfigureConnectionMessage): void {
        this.emit('configureConnection', message);
    }

    /**
     * Handles keyboard state changes. Updates internal state and emits 'keyboard'.
     *
     * @param message - The keyboard message with state and attributes.
     */
    onKeyboard(message: Proto.KeyboardMessage): void {
        this.#keyboardState = message.state;
        this.#keyboardAttributes = message.attributes ?? null;

        this.emit('keyboard', message);
    }

    /**
     * Handles initial device info. Updates output device UID and cluster info.
     *
     * @param message - The device info message.
     */
    onDeviceInfo(message: Proto.DeviceInfoMessage): void {
        this.#updateDeviceInfo(message);
        this.emit('deviceInfo', message);
    }

    /**
     * Handles device info updates (e.g. cluster changes). Updates output device UID and cluster info.
     *
     * @param message - The device info update message.
     */
    onDeviceInfoUpdate(message: Proto.DeviceInfoMessage): void {
        this.#updateDeviceInfo(message);
        this.emit('deviceInfoUpdate', message);
    }

    /**
     * Handles origin client properties updates.
     *
     * @param message - The origin client properties message.
     */
    onOriginClientProperties(message: Proto.OriginClientPropertiesMessage): void {
        this.emit('originClientProperties', message);
    }

    /**
     * Handles player client properties updates.
     *
     * @param message - The player client properties message.
     */
    onPlayerClientProperties(message: Proto.PlayerClientPropertiesMessage): void {
        this.emit('playerClientProperties', message);
    }

    /**
     * Handles removal of a client (app). Clears the now-playing reference if
     * the removed client was the active one.
     *
     * @param message - The remove client message.
     */
    onRemoveClient(message: Proto.RemoveClientMessage): void {
        if (!message.client?.bundleIdentifier) {
            return;
        }

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
            this.#emitActivePlayerChanged();
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    /**
     * Handles command result notifications from the Apple TV.
     *
     * @param message - The send command result message.
     */
    onSendCommandResult(message: Proto.SendCommandResultMessage): void {
        this.emit('sendCommandResult', message);
    }

    /**
     * Handles lyrics events (time-synced lyrics updates).
     *
     * @param message - The lyrics event message.
     */
    onSendLyricsEvent(message: Proto.SendLyricsEventMessage): void {
        if (message.event) {
            this.emit('lyricsEvent', message.event, message.playerPath);
        }
    }

    /**
     * Handles artwork set notifications.
     *
     * @param message - The set artwork message.
     */
    onSetArtwork(message: Proto.SetArtworkMessage): void {
        if (message.jpegData?.byteLength > 0) {
            this.#artworkJpegData = message.jpegData;
        }

        this.emit('setArtwork', message);
    }

    /**
     * Handles default supported commands for a client. These serve as fallback
     * commands when a player has no commands of its own.
     *
     * @param message - The set default supported commands message.
     */
    onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.supportedCommands) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.setDefaultSupportedCommands(message.supportedCommands.supportedCommands);
        }

        this.emit('setDefaultSupportedCommands', message);
    }

    /**
     * Handles the now-playing client changing (e.g. user switches app).
     * Updates the active client reference and emits change events.
     *
     * @param message - The set now-playing client message.
     */
    onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): void {
        const oldBundleId = this.#nowPlayingClientBundleIdentifier;
        this.#nowPlayingClientBundleIdentifier = message.client?.bundleIdentifier ?? null;

        if (message.client?.bundleIdentifier && message.client?.displayName) {
            this.#client(message.client.bundleIdentifier, message.client.displayName);
        }

        this.emit('setNowPlayingClient', message);

        if (oldBundleId !== this.#nowPlayingClientBundleIdentifier) {
            this.#emitActivePlayerChanged();
        }

        this.#emitNowPlayingChangedIfNeeded();
    }

    /**
     * Handles the active player changing within a client (e.g. PiP player becomes active).
     * Creates the player if needed and sets it as the active player.
     *
     * @param message - The set now-playing player message.
     */
    onSetNowPlayingPlayer(message: Proto.SetNowPlayingPlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            const oldActiveId = client.activePlayer?.identifier;
            client.getOrCreatePlayer(message.playerPath.player.identifier, message.playerPath.player.displayName);
            client.setActivePlayer(message.playerPath.player.identifier);

            if (oldActiveId !== message.playerPath.player.identifier) {
                this.#emitActivePlayerChanged();
            }
        }

        this.emit('setNowPlayingPlayer', message);
        this.#emitNowPlayingChangedIfNeeded();
    }

    /**
     * Handles comprehensive state updates. Processes playback state, now-playing info,
     * supported commands, and playback queue in a single message.
     * Emits granular events for each changed aspect.
     *
     * @param message - The set state message.
     */
    onSetState(message: Proto.SetStateMessage): void {
        const bundleIdentifier = message.playerPath?.client?.bundleIdentifier;

        if (!bundleIdentifier) {
            return;
        }

        const client = this.#client(bundleIdentifier, message.displayName);
        const playerIdentifier = message.playerPath?.player?.identifier || DEFAULT_PLAYER_ID;
        const player = client.getOrCreatePlayer(playerIdentifier, message.playerPath?.player?.displayName);
        const isActiveClient = bundleIdentifier === this.#nowPlayingClientBundleIdentifier;

        if (message.playbackState) {
            const oldState = player.playbackState;
            player.setPlaybackState(message.playbackState, message.playbackStateTimestamp);

            if (isActiveClient && oldState !== player.playbackState) {
                this.emit('playbackStateChanged', client, player, oldState, player.playbackState);
            }
        }

        if (message.nowPlayingInfo) {
            player.setNowPlayingInfo(message.nowPlayingInfo);
        }

        if (message.supportedCommands) {
            player.setSupportedCommands(message.supportedCommands.supportedCommands);

            if (isActiveClient) {
                this.emit('supportedCommandsChanged', client, player, player.supportedCommands);
            }
        }

        if (message.playbackQueue) {
            player.setPlaybackQueue(message.playbackQueue);

            if (isActiveClient) {
                this.emit('playbackQueueChanged', client, player);
            }
        }

        this.emit('setState', message);

        if (isActiveClient) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    /**
     * Handles content item updates (metadata, artwork, lyrics changes for existing items).
     *
     * @param message - The update content item message.
     */
    onUpdateContentItem(message: Proto.UpdateContentItemMessage): void {
        const bundleIdentifier = message.playerPath?.client?.bundleIdentifier;

        if (!bundleIdentifier) {
            return;
        }

        const client = this.#client(bundleIdentifier, message.playerPath?.client?.displayName ?? '');
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

    /**
     * Handles artwork updates for content items. Emits 'artworkChanged' if a client and player are active.
     *
     * @param message - The update content item artwork message.
     */
    onUpdateContentItemArtwork(message: Proto.UpdateContentItemArtworkMessage): void {
        this.emit('updateContentItemArtwork', message);

        const client = this.nowPlayingClient;
        const player = client?.activePlayer;

        if (client && player) {
            this.emit('artworkChanged', client, player);
        }
    }

    /**
     * Handles player registration or update. Creates the player if it does not exist.
     *
     * @param message - The update player message.
     */
    onUpdatePlayer(message: Proto.UpdatePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.getOrCreatePlayer(message.playerPath.player.identifier, message.playerPath.player.displayName);
        }

        this.emit('updatePlayer', message);
    }

    /**
     * Handles player removal. Removes the player from its client and emits
     * active player changed events if the removed player was active.
     *
     * @param message - The remove player message.
     */
    onRemovePlayer(message: Proto.RemovePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#clients[message.playerPath.client.bundleIdentifier];

            if (client) {
                client.removePlayer(message.playerPath.player.identifier);
            }
        }

        this.emit('removePlayer', message);

        if (message.playerPath?.client?.bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitActivePlayerChanged();
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    /**
     * Handles client (app) registration or display name update.
     *
     * @param message - The update client message.
     */
    onUpdateClient(message: Proto.UpdateClientMessage): void {
        if (!message.client?.bundleIdentifier) {
            return;
        }

        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('updateClient', message);
        this.emit('clients', this.#clients);
    }

    /**
     * Handles output device list updates. Prefers cluster-aware devices when available.
     *
     * @param message - The update output device message.
     */
    /**
     * Handles playback queue participant updates (e.g. SharePlay users).
     *
     * @param message - The participants update message.
     */
    onPlayerClientParticipantsUpdate(message: Proto.PlayerClientParticipantsUpdateMessage): void {
        this.#participants = message.participants ?? [];
        this.emit('playerClientParticipantsUpdate', message);
    }

    onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): void {
        this.#outputDevices = message.clusterAwareOutputDevices?.length > 0
            ? message.clusterAwareOutputDevices
            : message.outputDevices;

        this.emit('updateOutputDevice', message);
    }

    /**
     * Handles volume control availability changes.
     *
     * @param message - The volume control availability message.
     */
    onVolumeControlAvailability(message: Proto.VolumeControlAvailabilityMessage): void {
        this.#volumeAvailable = message.volumeControlAvailable;
        this.#volumeCapabilities = message.volumeCapabilities;

        this.emit('volumeControlAvailability', message.volumeControlAvailable, message.volumeCapabilities);
    }

    /**
     * Handles volume capabilities changes (e.g. device gains or loses absolute volume support).
     *
     * @param message - The volume capabilities change message.
     */
    onVolumeControlCapabilitiesDidChange(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
        if (!message.capabilities) {
            return;
        }

        this.#volumeAvailable = message.capabilities.volumeControlAvailable;
        this.#volumeCapabilities = message.capabilities.volumeCapabilities;

        this.emit('volumeControlCapabilitiesDidChange', message.capabilities.volumeControlAvailable, message.capabilities.volumeCapabilities);
    }

    /**
     * Handles volume level changes.
     *
     * @param message - The volume change message.
     */
    onVolumeDidChange(message: Proto.VolumeDidChangeMessage): void {
        this.#volume = message.volume;

        this.emit('volumeDidChange', message.volume);
    }

    /**
     * Handles mute state changes.
     *
     * @param message - The volume muted change message.
     */
    onVolumeMutedDidChange(message: Proto.VolumeMutedDidChangeMessage): void {
        this.#volumeMuted = message.isMuted;

        this.emit('volumeMutedDidChange', this.#volumeMuted);
    }

    /**
     * Extracts output device UID and cluster information from a device info message.
     *
     * @param message - The device info message.
     */
    #updateDeviceInfo(message: Proto.DeviceInfoMessage): void {
        const previousClusterID = this.#clusterID;
        const previousIsLeader = this.#isClusterLeader;

        this.#outputDeviceUID = message.clusterID || message.deviceUID || message.uniqueIdentifier || null;
        this.#clusterID = message.clusterID || null;
        this.#clusterType = message.clusterType ?? 0;
        this.#isClusterAware = message.isClusterAware ?? false;
        this.#isClusterLeader = message.isClusterLeader ?? false;

        if (this.#clusterID !== previousClusterID || this.#isClusterLeader !== previousIsLeader) {
            this.emit('clusterChanged', this.#clusterID, this.#isClusterLeader);
        }
    }

    /**
     * Gets or creates a Client for the given bundle identifier.
     * Updates the display name if the client already exists.
     *
     * @param bundleIdentifier - The app's bundle identifier.
     * @param displayName - The app's display name.
     * @returns The existing or newly created Client.
     */
    #client(bundleIdentifier: string, displayName: string): AirPlayClient {
        if (bundleIdentifier in this.#clients) {
            const client = this.#clients[bundleIdentifier];

            if (displayName) {
                client.updateDisplayName(displayName);
            }

            return client;
        } else {
            const client = new AirPlayClient(bundleIdentifier, displayName);
            this.#clients[bundleIdentifier] = client;

            this.emit('clients', this.#clients);

            return client;
        }
    }

    /**
     * Creates a snapshot of the current now-playing state for change detection.
     *
     * @returns A NowPlayingSnapshot of the current state.
     */
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
            playbackRate: player?.playbackRate ?? 0,
            shuffleMode: player?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown,
            repeatMode: player?.repeatMode ?? Proto.RepeatMode_Enum.Unknown,
            mediaType: player?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType,
            seriesName: player?.seriesName ?? '',
            seasonNumber: player?.seasonNumber ?? 0,
            episodeNumber: player?.episodeNumber ?? 0,
            contentIdentifier: player?.contentIdentifier ?? '',
            artworkId: player?.artworkId ?? null,
            hasArtworkUrl: player?.artworkUrl() != null,
            hasArtworkData: player?.currentItemArtwork != null,
            isAlwaysLive: player?.nowPlayingInfo?.isAlwaysLive ?? false,
            isAdvertisement: player?.nowPlayingInfo?.isAdvertisement ?? false
        };
    }

    /** Emits the 'activePlayerChanged' event with the current client and player. */
    #emitActivePlayerChanged(): void {
        const client = this.nowPlayingClient;
        this.emit('activePlayerChanged', client, client?.activePlayer ?? null);
    }

    /** Emits 'nowPlayingChanged' only if the now-playing snapshot has actually changed. */
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

    /**
     * Compares two NowPlayingSnapshot instances field-by-field for equality.
     *
     * @param a - First snapshot.
     * @param b - Second snapshot.
     * @returns True if all fields are equal.
     */
    #snapshotsEqual(a: NowPlayingSnapshot, b: NowPlayingSnapshot): boolean {
        return a.bundleIdentifier === b.bundleIdentifier
            && a.playerIdentifier === b.playerIdentifier
            && a.playbackState === b.playbackState
            && a.title === b.title
            && a.artist === b.artist
            && a.album === b.album
            && a.genre === b.genre
            && a.duration === b.duration
            && a.playbackRate === b.playbackRate
            && a.shuffleMode === b.shuffleMode
            && a.repeatMode === b.repeatMode
            && a.mediaType === b.mediaType
            && a.seriesName === b.seriesName
            && a.seasonNumber === b.seasonNumber
            && a.episodeNumber === b.episodeNumber
            && a.contentIdentifier === b.contentIdentifier
            && a.artworkId === b.artworkId
            && a.hasArtworkUrl === b.hasArtworkUrl
            && a.hasArtworkData === b.hasArtworkData
            && a.isAlwaysLive === b.isAlwaysLive
            && a.isAdvertisement === b.isAdvertisement;
    }
}
