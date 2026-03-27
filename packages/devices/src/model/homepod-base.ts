import { EventEmitter } from 'node:events';
import * as AirPlay from '@basmilius/apple-airplay';
import type { AudioSource, DiscoveryResult } from '@basmilius/apple-common';
import { type AirPlayClient, AirPlayDevice, type AirPlayRemote, type AirPlayState, type AirPlayVolume } from '../airplay';

/**
 * Events emitted by HomePod models.
 * - `connected` — emitted after the AirPlay connection is established.
 * - `disconnected` — emitted when the connection is lost.
 */
type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

/**
 * Abstract base class for HomePod models (HomePod and HomePod Mini).
 * Uses AirPlay only (no Companion Link). Supports transient pairing, media control,
 * URL playback, and audio streaming.
 */
export default abstract class extends EventEmitter<EventMap> {
    /** The underlying AirPlay device for direct protocol access. */
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    /** AirPlay remote controller for HID keys and commands. */
    get remote(): AirPlayRemote {
        return this.#airplay.remote;
    }

    /** AirPlay state tracker for now-playing and volume. */
    get state(): AirPlayState {
        return this.#airplay.state;
    }

    /** AirPlay volume controller. */
    get volumeControl(): AirPlayVolume {
        return this.#airplay.volume;
    }

    /** Bundle identifier of the currently playing app, or null. */
    get bundleIdentifier(): string | null {
        return this.#nowPlayingClient?.bundleIdentifier ?? null;
    }

    /** Display name of the currently playing app, or null. */
    get displayName(): string | null {
        return this.#nowPlayingClient?.displayName ?? null;
    }

    /** Whether the AirPlay connection is active. */
    get isConnected(): boolean {
        return this.#airplay.isConnected;
    }

    /** Whether the active player is currently playing. */
    get isPlaying(): boolean {
        return this.#nowPlayingClient?.isPlaying ?? false;
    }

    /** Current track title. */
    get title(): string {
        return this.#nowPlayingClient?.title ?? '';
    }

    /** Current track artist. */
    get artist(): string {
        return this.#nowPlayingClient?.artist ?? '';
    }

    /** Current track album. */
    get album(): string {
        return this.#nowPlayingClient?.album ?? '';
    }

    /** Duration of the current track in seconds. */
    get duration(): number {
        return this.#nowPlayingClient?.duration ?? 0;
    }

    /** Extrapolated elapsed time in seconds. */
    get elapsedTime(): number {
        return this.#nowPlayingClient?.elapsedTime ?? 0;
    }

    /** Current playback queue from the active player. */
    get playbackQueue(): AirPlay.Proto.PlaybackQueue | null {
        return this.#nowPlayingClient?.playbackQueue ?? null;
    }

    /** Current playback state. */
    get playbackState(): AirPlay.Proto.PlaybackState_Enum {
        return this.#nowPlayingClient?.playbackState ?? AirPlay.Proto.PlaybackState_Enum.Unknown;
    }

    /** Timestamp of the last playback state update. */
    get playbackStateTimestamp(): number {
        return this.#nowPlayingClient?.playbackStateTimestamp ?? -1;
    }

    /** Current volume level (0.0 - 1.0). */
    get volume(): number {
        return this.#airplay.state.volume ?? 0;
    }

    /** Whether the device is currently muted. */
    get isMuted(): boolean {
        return this.#airplay.state.volumeMuted;
    }

    /** Cluster ID when part of a speaker group, or null. */
    get clusterID(): string | null {
        return this.#airplay.state.clusterID;
    }

    /** Cluster type identifier (0 = none). */
    get clusterType(): number {
        return this.#airplay.state.clusterType;
    }

    /** Whether this device supports cluster-aware multi-room. */
    get isClusterAware(): boolean {
        return this.#airplay.state.isClusterAware;
    }

    /** Whether this device is the leader in a speaker cluster. */
    get isClusterLeader(): boolean {
        return this.#airplay.state.isClusterLeader;
    }

    /** @returns The currently active now-playing client, or null. */
    get #nowPlayingClient(): AirPlayClient | null {
        return this.#airplay.state.nowPlayingClient;
    }

    readonly #airplay: AirPlayDevice;
    #disconnect: boolean = false;

    /**
     * Creates a new HomePod base instance.
     *
     * @param discoveryResult - The mDNS discovery result for the AirPlay service.
     */
    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#airplay = new AirPlayDevice(discoveryResult);
        this.#airplay.on('connected', () => this.#onConnected());
        this.#airplay.on('disconnected', unexpected => this.#onDisconnected(unexpected));
    }

    /** Connects to the HomePod via AirPlay (transient pairing). */
    async connect(): Promise<void> {
        await this.#airplay.connect();
        this.#disconnect = false;
    }

    /** Disconnects from the HomePod. */
    async disconnect(): Promise<void> {
        await this.#airplay.disconnect();
    }

    /** Sends a Pause command. */
    async pause(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Pause);
    }

    /** Sends a TogglePlayPause command. */
    async playPause(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.TogglePlayPause);
    }

    /** Sends a Play command. */
    async play(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Play);
    }

    /** Sends a Stop command. */
    async stop(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Stop);
    }

    /** Sends a NextInContext command (next track). */
    async next(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.NextInContext);
    }

    /** Sends a PreviousInContext command (previous track). */
    async previous(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.PreviousInContext);
    }

    /**
     * Plays a URL on the HomePod (the device fetches and plays the content).
     *
     * @param url - The media URL to play.
     * @param position - Start position in seconds (defaults to 0).
     */
    async playUrl(url: string, position: number = 0): Promise<void> {
        await this.#airplay.playUrl(url, position);
    }

    /** Waits for the current URL playback to finish. */
    async waitForPlaybackEnd(): Promise<void> {
        await this.#airplay.waitForPlaybackEnd();
    }

    /** Stops the current URL playback and cleans up. */
    stopPlayUrl(): void {
        this.#airplay.stopPlayUrl();
    }

    /**
     * Streams audio from a source to the HomePod via RAOP/RTP.
     *
     * @param source - The audio source to stream.
     */
    async streamAudio(source: AudioSource): Promise<void> {
        await this.#airplay.streamAudio(source);
    }

    /**
     * Requests the current playback queue with lyrics from the device.
     * Lyrics are included by default in the playback queue request.
     * Real-time lyrics timing events are emitted via the `lyricsEvent` event on state.
     *
     * @param length - Maximum number of queue items to retrieve (defaults to 1).
     */
    async requestLyrics(length: number = 1): Promise<void> {
        await this.#airplay.requestPlaybackQueue(length);
    }

    /**
     * Gets the CommandInfo for a specific command from the active player.
     *
     * @param command - The command to look up.
     * @returns The command info, or null if no client is active or command not found.
     */
    async getCommandInfo(command: AirPlay.Proto.Command): Promise<AirPlay.Proto.CommandInfo | null> {
        const client = this.#airplay.state.nowPlayingClient;

        if (!client) {
            return null;
        }

        return client.supportedCommands.find(c => c.command === command) ?? null;
    }

    /**
     * Checks whether a command is supported and enabled by the active player.
     *
     * @param command - The command to check.
     * @returns True if supported and enabled, false otherwise.
     */
    async isCommandSupported(command: AirPlay.Proto.Command): Promise<boolean> {
        const client = this.#airplay.state.nowPlayingClient;

        if (!client) {
            return false;
        }

        return client.isCommandSupported(command);
    }

    /** Emits 'connected' when the AirPlay connection is established. */
    async #onConnected(): Promise<void> {
        this.emit('connected');
    }

    /**
     * Handles disconnection. Disconnects and emits 'disconnected'.
     * Only fires once per disconnect cycle.
     *
     * @param unexpected - Whether the disconnection was unexpected.
     */
    async #onDisconnected(unexpected: boolean): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;

        await this.disconnect();
        this.emit('disconnected', unexpected);
    }
}
