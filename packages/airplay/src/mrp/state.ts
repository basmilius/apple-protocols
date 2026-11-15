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
 * What the state derives from the messages, announced once the new values are in place. The
 * messages themselves are the events of the data channel; the state does not repeat them.
 */
export type MediaRemoteStateEventMap = {
    readonly activePlayerChanged: [client: Client | null, player: Player | null];
    readonly artworkChanged: [client: Client, player: Player];
    readonly clients: [Record<string, Client>];
    readonly clusterChanged: [clusterID: string | null, isLeader: boolean];
    readonly keyboardChanged: [state: Proto.KeyboardState_Enum, attributes: Proto.TextEditingAttributes | null];
    readonly lyricsEvent: [event: Proto.LyricsEvent, playerPath: Proto.PlayerPath | undefined];
    readonly nowPlayingChanged: [client: Client | null, player: Player | null];
    readonly outputDevicesChanged: [devices: Proto.AVOutputDeviceDescriptor[]];
    readonly participantsChanged: [participants: Proto.PlaybackQueueParticipant[]];
    readonly playbackQueueChanged: [client: Client, player: Player];
    readonly playbackStateChanged: [client: Client, player: Player, oldState: Proto.PlaybackState_Enum, newState: Proto.PlaybackState_Enum];
    readonly supportedCommandsChanged: [client: Client, player: Player, commands: Proto.CommandInfo[]];
    readonly volumeChanged: [volume: number];
    readonly volumeControlChanged: [available: boolean, capabilities: Proto.VolumeCapabilities_Enum];
    readonly volumeMutedChanged: [muted: boolean];
};

/**
 * The MRP state of a receiver as a model: clients and their players, what plays now, volume,
 * keyboard, output devices and cluster. It derives everything from the messages it is given with
 * {@link apply} and does no I/O, so recorded traffic feeds it as well as a live data channel.
 */
export class MediaRemoteState extends EventEmitter<MediaRemoteStateEventMap> {
    /** The now-playing apps, keyed by bundle identifier. */
    get clients(): Record<string, Client> {
        return this.#clients;
    }

    /** Whether a text input session is open on the receiver. */
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

    /** Null when the receiver named no now-playing app. */
    get nowPlayingClient(): Client | null {
        return this.#nowPlayingClientBundleIdentifier ? this.#clients[this.#nowPlayingClientBundleIdentifier] ?? null : null;
    }

    /** The device that volume commands address; the cluster ID for a clustered HomePod pair. */
    get outputDeviceUID(): string | null {
        return this.#outputDeviceUID;
    }

    /** The devices in the current AirPlay group. */
    get outputDevices(): Proto.AVOutputDeviceDescriptor[] {
        return this.#outputDevices;
    }

    /** Null outside a multiroom cluster. */
    get clusterID(): string | null {
        return this.#clusterID;
    }

    /** 0 outside a cluster. */
    get clusterType(): number {
        return this.#clusterType;
    }

    get isClusterAware(): boolean {
        return this.#isClusterAware;
    }

    get isClusterLeader(): boolean {
        return this.#isClusterLeader;
    }

    /** For example SharePlay users. */
    get participants(): Proto.PlaybackQueueParticipant[] {
        return this.#participants;
    }

    /** The JPEG of the last SET_ARTWORK. */
    get artworkJpegData(): Uint8Array | null {
        return this.#artworkJpegData;
    }

    /** 0 to 1. */
    get volume(): number {
        return this.#volume;
    }

    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    get volumeCapabilities(): Proto.VolumeCapabilities_Enum {
        return this.#volumeCapabilities;
    }

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
            case 'keyboard':
                return this.#onKeyboard(message);
            case 'deviceInfo':
            case 'deviceInfoUpdate':
                return this.#updateDeviceInfo(message);
            case 'removeClient':
                return this.#onRemoveClient(message);
            case 'removePlayer':
                return this.#onRemovePlayer(message);
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

    #onKeyboard(message: Proto.KeyboardMessage): void {
        this.#keyboardState = message.state;
        this.#keyboardAttributes = message.attributes ?? null;

        this.emit('keyboardChanged', this.#keyboardState, this.#keyboardAttributes);
    }

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

        this.emit('clients', this.#clients);

        if (wasActive) {
            this.#emitActivePlayerChanged();
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    #onSendLyricsEvent(message: Proto.SendLyricsEventMessage): void {
        if (message.event) {
            this.emit('lyricsEvent', message.event, message.playerPath);
        }
    }

    #onSetArtwork(message: Proto.SetArtworkMessage): void {
        if (message.jpegData?.byteLength > 0) {
            this.#artworkJpegData = message.jpegData;
        }

        const client = this.nowPlayingClient;
        const player = client?.activePlayer;

        if (client && player) {
            this.emit('artworkChanged', client, player);
        }
    }

    #onSetDefaultSupportedCommands(message: Proto.SetDefaultSupportedCommandsMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.supportedCommands) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.setDefaultSupportedCommands(message.supportedCommands.supportedCommands);
        }
    }

    #onSetNowPlayingClient(message: Proto.SetNowPlayingClientMessage): void {
        const oldBundleId = this.#nowPlayingClientBundleIdentifier;
        this.#nowPlayingClientBundleIdentifier = message.client?.bundleIdentifier ?? null;

        if (message.client?.bundleIdentifier && message.client?.displayName) {
            this.#client(message.client.bundleIdentifier, message.client.displayName);
        }

        if (oldBundleId !== this.#nowPlayingClientBundleIdentifier) {
            this.#emitActivePlayerChanged();
        }

        this.#emitNowPlayingChangedIfNeeded();
    }

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

        this.#emitNowPlayingChangedIfNeeded();
    }

    /** One SET_STATE can carry playback state, now-playing info, commands and queue at once; only the active client emits. */
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

        if (isActiveClient) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

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

        if (bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

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

        const client = this.nowPlayingClient;
        const player = client?.activePlayer;

        if (client && player) {
            this.emit('artworkChanged', client, player);
        }
    }

    #onUpdatePlayer(message: Proto.UpdatePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#client(message.playerPath.client.bundleIdentifier, message.playerPath.client.displayName);
            client.getOrCreatePlayer(message.playerPath.player.identifier, message.playerPath.player.displayName);
        }
    }

    #onRemovePlayer(message: Proto.RemovePlayerMessage): void {
        if (message.playerPath?.client?.bundleIdentifier && message.playerPath?.player?.identifier) {
            const client = this.#clients[message.playerPath.client.bundleIdentifier];

            if (client) {
                client.removePlayer(message.playerPath.player.identifier);
            }
        }

        if (message.playerPath?.client?.bundleIdentifier === this.#nowPlayingClientBundleIdentifier) {
            this.#emitActivePlayerChanged();
            this.#emitNowPlayingChangedIfNeeded();
        }
    }

    #onUpdateClient(message: Proto.UpdateClientMessage): void {
        if (!message.client?.bundleIdentifier) {
            return;
        }

        this.#client(message.client.bundleIdentifier, message.client.displayName);

        this.emit('clients', this.#clients);
    }

    #onPlayerClientParticipantsUpdate(message: Proto.PlayerClientParticipantsUpdateMessage): void {
        this.#participants = message.participants ?? [];
        this.emit('participantsChanged', this.#participants);
    }

    /** Prefers the cluster-aware list when the receiver sends one. */
    #onUpdateOutputDevice(message: Proto.UpdateOutputDeviceMessage): void {
        this.#outputDevices = message.clusterAwareOutputDevices?.length > 0
            ? message.clusterAwareOutputDevices
            : message.outputDevices;

        this.emit('outputDevicesChanged', this.#outputDevices);
    }

    #onVolumeControlAvailability(message: Proto.VolumeControlAvailabilityMessage): void {
        this.#volumeAvailable = message.volumeControlAvailable;
        this.#volumeCapabilities = message.volumeCapabilities;

        this.emit('volumeControlChanged', this.#volumeAvailable, this.#volumeCapabilities);
    }

    #onVolumeControlCapabilitiesDidChange(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
        if (!message.capabilities) {
            return;
        }

        this.#volumeAvailable = message.capabilities.volumeControlAvailable;
        this.#volumeCapabilities = message.capabilities.volumeCapabilities;

        this.emit('volumeControlChanged', this.#volumeAvailable, this.#volumeCapabilities);
    }

    #onVolumeDidChange(message: Proto.VolumeDidChangeMessage): void {
        this.#volume = message.volume;

        this.emit('volumeChanged', message.volume);
    }

    #onVolumeMutedDidChange(message: Proto.VolumeMutedDidChangeMessage): void {
        this.#volumeMuted = message.isMuted;

        this.emit('volumeMutedChanged', this.#volumeMuted);
    }

    /** The cluster ID wins over the device UID, so volume commands address a clustered HomePod pair as one device. */
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

    /** Gets or creates the client; a non-empty display name replaces the known one. */
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

    #emitActivePlayerChanged(): void {
        const client = this.nowPlayingClient;
        this.emit('activePlayerChanged', client, client?.activePlayer ?? null);
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
