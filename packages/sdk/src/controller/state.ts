import { EventEmitter } from 'node:events';
import type { Proto } from '@basmilius/apple-airplay';
import type { AirPlayClient } from '../internal/airplay-client';
import type { AirPlayManager } from '../internal/airplay-manager';
import type { AirPlayPlayer } from '../internal/airplay-player';
import type { AirPlayState } from '../internal/airplay-state';
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

        state.on('nowPlayingChanged', (client, player) => {
            this.emit('nowPlayingChanged', client, player);

            const app = client
                ? { bundleIdentifier: client.bundleIdentifier, displayName: client.displayName }
                : null;

            this.emit('activeAppChanged', app?.bundleIdentifier ?? null, app?.displayName ?? null);
        });

        state.on('playbackStateChanged', (client, player, oldState, newState) => {
            this.emit('playbackStateChanged', client, player, oldState, newState);
        });

        state.on('volumeDidChange', (volume) => {
            this.emit('volumeChanged', volume);
        });

        state.on('volumeMutedDidChange', (muted) => {
            this.emit('volumeMutedChanged', muted);
        });

        state.on('artworkChanged', (client, player) => {
            this.emit('artworkChanged', client, player);
        });

        state.on('supportedCommandsChanged', (client, player, commands) => {
            this.emit('supportedCommandsChanged', client, player, commands);
        });

        state.on('clusterChanged', (clusterId, isLeader) => {
            this.emit('clusterChanged', clusterId, isLeader);
        });
    }

    /**
     * Removes all event listeners from this controller.
     * @internal
     */
    unsubscribe(): void {
        this.removeAllListeners();
    }
}
