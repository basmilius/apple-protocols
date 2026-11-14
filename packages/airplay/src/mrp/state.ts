import { EventEmitter } from 'node:events';
import { Client } from './client';
import type { MrpMessage } from './codec';
import { DEFAULT_PLAYER_ID, type Player } from './player';
import * as Proto from './proto';

/**
 * What `nowPlayingChanged` compares, field by field, so it does not fire when nothing a listener
 * shows has changed. Elapsed time is left out: it moves on its own.
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
    episodeTitle: string;
    contentRating: string;
    contentIdentifier: string;
    artworkId: string | null;
    hasArtworkUrl: boolean;
    hasArtworkData: boolean;
    isAlwaysLive: boolean;
    isAdvertisement: boolean;
};

/**
 * A message the state applied is announced under its own name, once the state it carries is in
 * place; a message it rejects, such as a SET_STATE without a client, is not. The derived events
 * (`nowPlayingChanged`, `activePlayerChanged`, ...) come with the resolved client and player.
 */
export type MediaRemoteStateEventMap = {
    readonly clients: [Record<string, Client>];
    readonly configureConnection: [Proto.ConfigureConnectionMessage];
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
    readonly volumeMutedDidChange: [boolean];

    readonly activePlayerChanged: [client: Client | null, player: Player | null];
    readonly artworkChanged: [client: Client, player: Player];
    readonly lyricsEvent: [event: Proto.LyricsEvent, playerPath: Proto.PlayerPath | undefined];
    readonly playbackQueueChanged: [client: Client, player: Player];
    readonly playbackStateChanged: [client: Client, player: Player, oldState: Proto.PlaybackState_Enum, newState: Proto.PlaybackState_Enum];
    readonly supportedCommandsChanged: [client: Client, player: Player, commands: Proto.CommandInfo[]];
    readonly clusterChanged: [clusterID: string | null, isLeader: boolean];
    readonly playerClientParticipantsUpdate: [Proto.PlayerClientParticipantsUpdateMessage];
};

/**
 * The MRP state of a receiver as a model: clients and their players, what plays now, volume,
 * keyboard, output devices and cluster. It derives everything from the messages it is given with
 * {@link apply} and does no I/O, so recorded traffic feeds it as well as a live data channel.
 */
export class MediaRemoteState extends EventEmitter<MediaRemoteStateEventMap> {
    /**
     * All known clients (apps) keyed by bundle identifier.
     */
    get clients(): Record<string, Client> {
        return this.#clients;
    }

    /**
     * Whether a keyboard/text input session is currently active on the Apple TV.
     */
    get isKeyboardActive(): boolean {
        return this.#keyboardState === Proto.KeyboardState_Enum.DidBeginEditing
            || this.#keyboardState === Proto.KeyboardState_Enum.Editing
            || this.#keyboardState === Proto.KeyboardState_Enum.TextDidChange;
    }

    /**
     * Text editing attributes for the active keyboard session, or null.
     */
    get keyboardAttributes(): Proto.TextEditingAttributes | null {
        return this.#keyboardAttributes;
    }

    /**
     * Current keyboard state enum value.
     */
    get keyboardState(): Proto.KeyboardState_Enum {
        return this.#keyboardState;
    }

    /**
     * The currently active now-playing client, or null if nothing is playing.
     */
    get nowPlayingClient(): Client | null {
        return this.#nowPlayingClientBundleIdentifier ? this.#clients[this.#nowPlayingClientBundleIdentifier] ?? null : null;
    }

    /**
     * UID of the primary output device (used for volume control and multi-room).
     */
    get outputDeviceUID(): string | null {
        return this.#outputDeviceUID;
    }

    /**
     * List of all output device descriptors in the current AirPlay group.
     */
    get outputDevices(): Proto.AVOutputDeviceDescriptor[] {
        return this.#outputDevices;
    }

    /**
     * Cluster identifier for multi-room groups, or null.
     */
    get clusterID(): string | null {
        return this.#clusterID;
    }

    /**
     * Cluster type code (0 if not clustered).
     */
    get clusterType(): number {
        return this.#clusterType;
    }

    /**
     * Whether this device is aware of multi-room clusters.
     */
    get isClusterAware(): boolean {
        return this.#isClusterAware;
    }

    /**
     * Whether this device is the leader of its multi-room cluster.
     */
    get isClusterLeader(): boolean {
        return this.#isClusterLeader;
    }

    /**
     * Current playback queue participants (e.g. SharePlay users).
     */
    get participants(): Proto.PlaybackQueueParticipant[] {
        return this.#participants;
    }

    /**
     * Raw JPEG artwork data from the last SET_ARTWORK_MESSAGE, or null.
     */
    get artworkJpegData(): Uint8Array | null {
        return this.#artworkJpegData;
    }

    /**
     * Current volume level (0.0 - 1.0).
     */
    get volume(): number {
        return this.#volume;
    }

    /**
     * Whether volume control is available on this device.
     */
    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    /**
     * Volume capabilities (absolute, relative, both, or none).
     */
    get volumeCapabilities(): Proto.VolumeCapabilities_Enum {
        return this.#volumeCapabilities;
    }

    /**
     * Whether the device is currently muted.
     */
    get volumeMuted(): boolean {
        return this.#volumeMuted;
    }

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
    #isClusterLeader: boolean;
    #participants: Proto.PlaybackQueueParticipant[];
    #artworkJpegData: Uint8Array | null;
    #volume: number;
    #volumeAvailable: boolean;
    #volumeCapabilities: Proto.VolumeCapabilities_Enum;
    #volumeMuted: boolean;

    constructor() {
        super();

        this.clear();
    }

    /**
     * Applies one decoded message. Messages the state does not track are ignored.
     *
     * @example
     * const decoded = decodeMessage(protocolMessage);
     * decoded && state.apply(...decoded);
     */
    apply(...[name, message]: MrpMessage): void {
        switch (name) {
            case 'configureConnection':
                return this.#onConfigureConnection(message);
            case 'keyboard':
                return this.#onKeyboard(message);
            case 'deviceInfo':
                return this.#onDeviceInfo(message);
            case 'deviceInfoUpdate':
                return this.#onDeviceInfoUpdate(message);
            case 'originClientProperties':
                return this.#onOriginClientProperties(message);
            case 'playerClientProperties':
                return this.#onPlayerClientProperties(message);
            case 'removeClient':
                return this.#onRemoveClient(message);
            case 'removePlayer':
                return this.#onRemovePlayer(message);
            case 'sendCommandResult':
                return this.#onSendCommandResult(message);
            case 'sendLyricsEvent':
                return this.#onSendLyricsEvent(message);
            case 'setArtwork':
                return this.#onSetArtwork(message);
            case 'setDefaultSupportedCommands':
                return this.#onSetDefaultSupportedCommands(message);
            case 'setNowPlayingClient':
                return this.#onSetNowPlayingClient(message);
            case 'setNowPlayingPlayer':
                return this.#onSetNowPlayingPlayer(message);
            case 'setState':
                return this.#onSetState(message);
            case 'updateClient':
                return this.#onUpdateClient(message);
            case 'updateContentItem':
                return this.#onUpdateContentItem(message);
            case 'updateContentItemArtwork':
                return this.#onUpdateContentItemArtwork(message);
            case 'updatePlayer':
                return this.#onUpdatePlayer(message);
            case 'playerClientParticipantsUpdate':
                return this.#onPlayerClientParticipantsUpdate(message);
            case 'updateOutputDevice':
                return this.#onUpdateOutputDevice(message);
            case 'volumeControlAvailability':
                return this.#onVolumeControlAvailability(message);
            case 'volumeControlCapabilitiesDidChange':
                return this.#onVolumeControlCapabilitiesDidChange(message);
            case 'volumeDidChange':
                return this.#onVolumeDidChange(message);
            case 'volumeMutedDidChange':
                return this.#onVolumeMutedDidChange(message);
        }
    }

    /**
     * Resets every value to its initial one. A state that outlives a session is cleared when the
     * next one connects, not when the last one ends.
     */
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
    #onConfigureConnection(message: Proto.ConfigureConnectionMessage): void {
        this.emit('configureConnection', message);
    }

    /**
     * Handles keyboard state changes. Updates internal state and emits 'keyboard'.
     *
     * @param message - The keyboard message with state and attributes.
     */
    #onKeyboard(message: Proto.KeyboardMessage): void {
        this.#keyboardState = message.state;
        this.#keyboardAttributes = message.attributes ?? null;

        this.emit('keyboard', message);
    }

    /**
     * Handles initial device info. Updates output device UID and cluster info.
     *
     * @param message - The device info message.
     */
    #onDeviceInfo(message: Proto.DeviceInfoMessage): void {
        this.#updateDeviceInfo(message);
        this.emit('deviceInfo', message);
    }

    /**
     * Handles device info updates (e.g. cluster changes). Updates output device UID and cluster info.
     *
     * @param message - The device info update message.
     */
    #onDeviceInfoUpdate(message: Proto.DeviceInfoMessage): void {
        this.#updateDeviceInfo(message);
        this.emit('deviceInfoUpdate', message);
    }

    /**
     * Handles origin client properties updates.
     *
     * @param message - The origin client properties message.
     */
    #onOriginClientProperties(message: Proto.OriginClientPropertiesMessage): void {
        this.emit('originClientProperties', message);
    }

    /**
     * Handles player client properties updates.
     *
     * @param message - The player client properties message.
     */
    #onPlayerClientProperties(message: Proto.PlayerClientPropertiesMessage): void {
        this.emit('playerClientProperties', message);
    }

    /**
     * Handles removal of a client (app). Clears the now-playing reference if
     * the removed client was the active one.
     *
     * @param message - The remove client message.
     */
    #onRemoveClient(message: Proto.RemoveClientMessage): void {
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
    #onSendCommandResult(message: Proto.SendCommandResultMessage): void {
        this.emit('sendCommandResult', message);
    }

    /**
     * Handles lyrics events (time-synced lyrics updates).
     *
     * @param message - The lyrics event message.
     */
    #onSendLyricsEvent(message: Proto.SendLyricsEventMessage): void {
        if (message.event) {
            this.emit('lyricsEvent', message.event, message.playerPath);
        }
    }

    /**
     * Handles artwork set notifications.
     *
     * @param message - The set artwork message.
     */
    #onSetArtwork(message: Proto.SetArtworkMessage): void {
        if (message.jpegData?.byteLength > 0) {
            this.#artworkJpegData = message.jpegData;
        }

        this.emit('setArtwork', message);

        const client = this.nowPlayingClient;
        const player = client?.activePlayer;

        if (client && player) {
            this.emit('artworkChanged', client, player);
        }
    }

    /**
     * Handles default supported commands for a client. These serve as fallback
     * commands when a player has no commands of its own.
     *
     * @param message - The set default supported commands message.
     */
    #onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): void {
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
    #onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): void {
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
    #onSetNowPlayingPlayer(message: Proto.SetNowPlayingPlayerMessage): void {
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
    #onSetState(message: Proto.SetStateMessage): void {
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
    #onUpdateContentItem(message: Proto.UpdateContentItemMessage): void {
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
    #onUpdateContentItemArtwork(message: Proto.UpdateContentItemArtworkMessage): void {
        const bundleIdentifier = message.playerPath?.client?.bundleIdentifier;

        if (bundleIdentifier) {
            const client = this.#client(bundleIdentifier, message.playerPath?.client?.displayName ?? '');
            const playerIdentifier = message.playerPath?.player?.identifier || DEFAULT_PLAYER_ID;
            const player = client.getOrCreatePlayer(playerIdentifier, message.playerPath?.player?.displayName);

            for (const item of message.contentItems) {
                player.updateContentItem(item);
            }

            if (bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
                this.#emitNowPlayingChangedIfNeeded();
            }
        }

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
    #onUpdatePlayer(message: Proto.UpdatePlayerMessage): void {
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
    #onRemovePlayer(message: Proto.RemovePlayerMessage): void {
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
    #onUpdateClient(message: Proto.UpdateClientMessage): void {
        if (!message.client?.bundleIdentifier) {
            return;
        }

        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('updateClient', message);
        this.emit('clients', this.#clients);
    }

    /**
     * Handles playback queue participant updates (e.g. SharePlay users).
     *
     * @param message - The participants update message.
     */
    #onPlayerClientParticipantsUpdate(message: Proto.PlayerClientParticipantsUpdateMessage): void {
        this.#participants = message.participants ?? [];
        this.emit('playerClientParticipantsUpdate', message);
    }

    /**
     * Handles output device list updates. Prefers cluster-aware devices when available.
     *
     * @param message - The update output device message.
     */
    #onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): void {
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
    #onVolumeControlAvailability(message: Proto.VolumeControlAvailabilityMessage): void {
        this.#volumeAvailable = message.volumeControlAvailable;
        this.#volumeCapabilities = message.volumeCapabilities;

        this.emit('volumeControlAvailability', message.volumeControlAvailable, message.volumeCapabilities);
    }

    /**
     * Handles volume capabilities changes (e.g. device gains or loses absolute volume support).
     *
     * @param message - The volume capabilities change message.
     */
    #onVolumeControlCapabilitiesDidChange(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
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
    #onVolumeDidChange(message: Proto.VolumeDidChangeMessage): void {
        this.#volume = message.volume;

        this.emit('volumeDidChange', message.volume);
    }

    /**
     * Handles mute state changes.
     *
     * @param message - The volume muted change message.
     */
    #onVolumeMutedDidChange(message: Proto.VolumeMutedDidChangeMessage): void {
        this.#volumeMuted = message.isMuted;

        this.emit('volumeMutedDidChange', this.#volumeMuted);
    }

    /**
     * Extracts output device UID and cluster information from a device info message. The cluster
     * ID comes first, so volume commands address a clustered HomePod pair as one device.
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
            episodeTitle: player?.episodeTitle ?? '',
            contentRating: player?.contentRating ?? '',
            contentIdentifier: player?.contentIdentifier ?? '',
            artworkId: player?.artworkId ?? null,
            hasArtworkUrl: player?.artworkUrl() != null,
            hasArtworkData: player?.currentItemArtwork != null,
            isAlwaysLive: player?.nowPlayingInfo?.isAlwaysLive ?? false,
            isAdvertisement: player?.nowPlayingInfo?.isAdvertisement ?? false
        };
    }

    /**
     * Emits the 'activePlayerChanged' event with the current client and player.
     */
    #emitActivePlayerChanged(): void {
        const client = this.nowPlayingClient;
        this.emit('activePlayerChanged', client, client?.activePlayer ?? null);
    }

    /**
     * Emits 'nowPlayingChanged' only if the now-playing snapshot has actually changed.
     */
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
            && a.episodeTitle === b.episodeTitle
            && a.contentRating === b.contentRating
            && a.contentIdentifier === b.contentIdentifier
            && a.artworkId === b.artworkId
            && a.hasArtworkUrl === b.hasArtworkUrl
            && a.hasArtworkData === b.hasArtworkData
            && a.isAlwaysLive === b.isAlwaysLive
            && a.isAdvertisement === b.isAdvertisement;
    }
}
