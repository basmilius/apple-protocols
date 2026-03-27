import { EventEmitter } from 'node:events';
import type { Proto } from '@basmilius/apple-airplay';
import type { AirPlayClient, AirPlayManager, AirPlayPlayer, AirPlayState } from '../internal';
import type { StateEventMap } from '../types';

/**
 * Now-playing state controller.
 * Provides read-only getters for the current playback state and emits
 * typed events when state changes occur.
 */
export class StateController extends EventEmitter<StateEventMap> {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        super();
        this.#airplay = airplay;

        this.onNowPlayingChanged = this.onNowPlayingChanged.bind(this);
        this.onPlaybackStateChanged = this.onPlaybackStateChanged.bind(this);
        this.onVolumeDidChange = this.onVolumeDidChange.bind(this);
        this.onVolumeMutedDidChange = this.onVolumeMutedDidChange.bind(this);
        this.onArtworkChanged = this.onArtworkChanged.bind(this);
        this.onSupportedCommandsChanged = this.onSupportedCommandsChanged.bind(this);
        this.onClusterChanged = this.onClusterChanged.bind(this);
    }

    get #state(): AirPlayState {
        return this.#airplay.state;
    }

    // --- Now Playing ---

    get title(): string {
        return this.#state.nowPlayingClient?.title ?? '';
    }

    get artist(): string {
        return this.#state.nowPlayingClient?.artist ?? '';
    }

    get album(): string {
        return this.#state.nowPlayingClient?.album ?? '';
    }

    get genre(): string {
        return this.#state.nowPlayingClient?.genre ?? '';
    }

    get duration(): number {
        return this.#state.nowPlayingClient?.duration ?? 0;
    }

    get elapsedTime(): number {
        return this.#state.nowPlayingClient?.elapsedTime ?? 0;
    }

    get playbackRate(): number {
        return this.#state.nowPlayingClient?.playbackRate ?? 0;
    }

    get isPlaying(): boolean {
        return this.#state.nowPlayingClient?.isPlaying ?? false;
    }

    get playbackState(): Proto.PlaybackState_Enum | undefined {
        return this.#state.nowPlayingClient?.playbackState;
    }

    get mediaType(): Proto.ContentItemMetadata_MediaType | undefined {
        return this.#state.nowPlayingClient?.mediaType;
    }

    get shuffleMode(): Proto.ShuffleMode_Enum | undefined {
        return this.#state.nowPlayingClient?.shuffleMode;
    }

    get repeatMode(): Proto.RepeatMode_Enum | undefined {
        return this.#state.nowPlayingClient?.repeatMode;
    }

    // --- Active App ---

    get activeApp(): { bundleIdentifier: string; displayName: string } | null {
        const client = this.#state.nowPlayingClient;

        if (!client) {
            return null;
        }

        return {
            bundleIdentifier: client.bundleIdentifier,
            displayName: client.displayName
        };
    }

    // --- Volume (read-only) ---

    get volume(): number {
        return this.#state.volume;
    }

    get isMuted(): boolean {
        return this.#state.volumeMuted;
    }

    get volumeAvailable(): boolean {
        return this.#state.volumeAvailable;
    }

    // --- Keyboard ---

    get isKeyboardActive(): boolean {
        return this.#state.keyboardState !== undefined;
    }

    // --- Cluster / Multi-room ---

    get clusterId(): string | null {
        return this.#state.clusterID;
    }

    get isClusterLeader(): boolean {
        return this.#state.isClusterLeader;
    }

    get outputDevices(): Proto.AVOutputDeviceDescriptor[] {
        return this.#state.outputDevices;
    }

    // --- Clients / Players ---

    get clients(): Record<string, AirPlayClient> {
        return this.#state.clients;
    }

    get activeClient(): AirPlayClient | null {
        return this.#state.nowPlayingClient;
    }

    get activePlayer(): AirPlayPlayer | null {
        return this.#state.nowPlayingClient?.activePlayer ?? null;
    }

    // --- Command Support ---

    isCommandSupported(command: Proto.Command): boolean {
        return this.#state.nowPlayingClient?.isCommandSupported(command) ?? false;
    }

    getCommandInfo(command: Proto.Command): Proto.CommandInfo | null {
        return this.#state.nowPlayingClient?.findCommand(command) ?? null;
    }

    /**
     * Subscribes to the underlying AirPlayState events and re-emits them.
     * Called internally by the device after connection is established.
     * @internal
     */
    subscribe(): void {
        const state = this.#state;

        state.on('nowPlayingChanged', this.onNowPlayingChanged);
        state.on('playbackStateChanged', this.onPlaybackStateChanged);
        state.on('volumeDidChange', this.onVolumeDidChange);
        state.on('volumeMutedDidChange', this.onVolumeMutedDidChange);
        state.on('artworkChanged', this.onArtworkChanged);
        state.on('supportedCommandsChanged', this.onSupportedCommandsChanged);
        state.on('clusterChanged', this.onClusterChanged);
    }

    /**
     * Removes forwarding listeners from the underlying AirPlayState.
     * Does not remove external listeners registered on this controller.
     * @internal
     */
    unsubscribe(): void {
        const state = this.#state;

        state.off('nowPlayingChanged', this.onNowPlayingChanged);
        state.off('playbackStateChanged', this.onPlaybackStateChanged);
        state.off('volumeDidChange', this.onVolumeDidChange);
        state.off('volumeMutedDidChange', this.onVolumeMutedDidChange);
        state.off('artworkChanged', this.onArtworkChanged);
        state.off('supportedCommandsChanged', this.onSupportedCommandsChanged);
        state.off('clusterChanged', this.onClusterChanged);
    }

    /** @internal */
    onNowPlayingChanged(client: AirPlayClient | null, player: AirPlayPlayer | null): void {
        this.emit('nowPlayingChanged', client, player);

        const app = client
            ? {bundleIdentifier: client.bundleIdentifier, displayName: client.displayName}
            : null;

        this.emit('activeAppChanged', app?.bundleIdentifier ?? null, app?.displayName ?? null);
    }

    /** @internal */
    onPlaybackStateChanged(client: AirPlayClient, player: AirPlayPlayer, oldState: Proto.PlaybackState_Enum, newState: Proto.PlaybackState_Enum): void {
        this.emit('playbackStateChanged', client, player, oldState, newState);
    }

    /** @internal */
    onVolumeDidChange(volume: number): void {
        this.emit('volumeChanged', volume);
    }

    /** @internal */
    onVolumeMutedDidChange(muted: boolean): void {
        this.emit('volumeMutedChanged', muted);
    }

    /** @internal */
    onArtworkChanged(client: AirPlayClient, player: AirPlayPlayer): void {
        this.emit('artworkChanged', client, player);
    }

    /** @internal */
    onSupportedCommandsChanged(client: AirPlayClient, player: AirPlayPlayer, commands: Proto.CommandInfo[]): void {
        this.emit('supportedCommandsChanged', client, player, commands);
    }

    /** @internal */
    onClusterChanged(clusterId: string | null, isLeader: boolean): void {
        this.emit('clusterChanged', clusterId, isLeader);
    }
}
