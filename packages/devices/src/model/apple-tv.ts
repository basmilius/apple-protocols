import { EventEmitter } from 'node:events';
import * as AirPlay from '@basmilius/apple-airplay';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import type { AttentionState, LaunchableApp, TextInputState, UserAccount } from '@basmilius/apple-companion-link';
import { AirPlayDevice } from '../airplay';
import { CompanionLinkDevice } from '../companion-link';
import { getCommandInfo, isCommandSupported } from '../utils';
import type Client from '../airplay/client';
import type Remote from '../airplay/remote';
import type State from '../airplay/state';
import type Volume from '../airplay/volume';

/**
 * Events emitted by AppleTV.
 * - `connected` — emitted after both AirPlay and Companion Link are connected.
 * - `disconnected` — emitted when either connection is lost.
 * - `power` — emitted when the device's attention state changes.
 * - `textInput` — emitted when a text input session starts, changes, or stops.
 */
type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    power: [AttentionState];
    textInput: [TextInputState];
};

/**
 * High-level Apple TV device model combining AirPlay (remote control, media, streaming)
 * and Companion Link (apps, accounts, power, text input) protocols.
 * Provides a unified interface for controlling an Apple TV.
 */
export default class extends EventEmitter<EventMap> {
    /** The underlying AirPlay device for direct protocol access. */
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    /** The underlying Companion Link device for direct protocol access. */
    get companionLink(): CompanionLinkDevice {
        return this.#companionLink;
    }

    /** AirPlay remote controller for HID keys and commands. */
    get remote(): Remote {
        return this.#airplay.remote;
    }

    /** AirPlay state tracker for now-playing, volume, and keyboard. */
    get state(): State {
        return this.#airplay.state;
    }

    /** AirPlay volume controller. */
    get volumeControl(): Volume {
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

    /** Whether both AirPlay and Companion Link are connected. */
    get isConnected(): boolean {
        return this.#airplay.isConnected && this.#companionLink.isConnected;
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

    /** @returns The currently active now-playing client, or null. */
    get #nowPlayingClient(): Client | null {
        return this.#airplay.state.nowPlayingClient;
    }

    readonly #airplay: AirPlayDevice;
    readonly #companionLink: CompanionLinkDevice;
    #disconnect: boolean = false;

    /**
     * Creates a new AppleTV instance.
     *
     * @param airplayDiscoveryResult - The mDNS discovery result for the AirPlay service.
     * @param companionLinkDiscoveryResult - The mDNS discovery result for the Companion Link service.
     */
    constructor(airplayDiscoveryResult: DiscoveryResult, companionLinkDiscoveryResult: DiscoveryResult) {
        super();

        this.#airplay = new AirPlayDevice(airplayDiscoveryResult);
        this.#companionLink = new CompanionLinkDevice(companionLinkDiscoveryResult);

        this.#airplay.on('connected', () => this.#onConnected());
        this.#airplay.on('disconnected', unexpected => this.#onDisconnected(unexpected));
        this.#companionLink.on('connected', () => this.#onConnected());
        this.#companionLink.on('disconnected', unexpected => this.#onDisconnected(unexpected));
        this.#companionLink.on('attentionStateChanged', state => this.emit('power', state));
        this.#companionLink.on('textInputChanged', state => this.emit('textInput', state));
    }

    /**
     * Connects both AirPlay and Companion Link protocols.
     * If Companion Link fails, AirPlay is disconnected to maintain consistency.
     *
     * @param airplayCredentials - Credentials for the AirPlay service.
     * @param companionLinkCredentials - Optional separate credentials for Companion Link (defaults to AirPlay credentials).
     */
    async connect(airplayCredentials: AccessoryCredentials, companionLinkCredentials?: AccessoryCredentials): Promise<void> {
        this.#airplay.setCredentials(airplayCredentials);
        await this.#companionLink.setCredentials(companionLinkCredentials ?? airplayCredentials);

        await this.#airplay.connect();

        try {
            await this.#companionLink.connect();
        } catch (err) {
            this.#airplay.disconnectSafely();
            throw err;
        }

        this.#disconnect = false;
    }

    /** Disconnects both AirPlay and Companion Link protocols. */
    async disconnect(): Promise<void> {
        await this.#airplay.disconnect();
        await this.#companionLink.disconnect();
    }

    /** Puts the Apple TV to sleep via a suspend HID key press. */
    async turnOff(): Promise<void> {
        await this.#airplay.remote.suspend();
    }

    /** Wakes the Apple TV from sleep via a wake HID key press. */
    async turnOn(): Promise<void> {
        await this.#airplay.remote.wake();
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

    /** Sends a NextInContext command (next track/episode). */
    async next(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.NextInContext);
    }

    /** Sends a PreviousInContext command (previous track/episode). */
    async previous(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.PreviousInContext);
    }

    /** Decreases volume via HID volume down key. */
    async volumeDown(): Promise<void> {
        await this.#airplay.remote.volumeDown();
    }

    /** Toggles mute via HID mute key. */
    async volumeMute(): Promise<void> {
        await this.#airplay.remote.mute();
    }

    /** Increases volume via HID volume up key. */
    async volumeUp(): Promise<void> {
        await this.#airplay.remote.volumeUp();
    }

    /**
     * Fetches the current attention state via Companion Link.
     *
     * @returns The current attention state.
     */
    async getAttentionState(): Promise<AttentionState> {
        return await this.#companionLink.getAttentionState();
    }

    /**
     * Fetches the list of launchable apps via Companion Link.
     *
     * @returns Array of launchable app descriptors.
     */
    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#companionLink.getLaunchableApps();
    }

    /**
     * Fetches user accounts configured on the device via Companion Link.
     *
     * @returns Array of user account descriptors.
     */
    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#companionLink.getUserAccounts();
    }

    /**
     * Launches an app via Companion Link.
     *
     * @param bundleId - The bundle identifier of the app to launch.
     */
    async launchApp(bundleId: string): Promise<void> {
        await this.#companionLink.launchApp(bundleId);
    }

    /**
     * Switches user account via Companion Link.
     *
     * @param accountId - The ID of the user account to switch to.
     */
    async switchUserAccount(accountId: string): Promise<void> {
        await this.#companionLink.switchUserAccount(accountId);
    }

    /**
     * Sets the text input field to the given text via Companion Link.
     *
     * @param text - The text to set.
     */
    async textSet(text: string): Promise<void> {
        await this.#companionLink.textSet(text);
    }

    /**
     * Appends text to the text input field via Companion Link.
     *
     * @param text - The text to append.
     */
    async textAppend(text: string): Promise<void> {
        await this.#companionLink.textAppend(text);
    }

    /** Clears the text input field via Companion Link. */
    async textClear(): Promise<void> {
        await this.#companionLink.textClear();
    }

    /**
     * Gets the CommandInfo for a specific command from the active player.
     *
     * @param command - The command to look up.
     * @returns The command info, or null if no client is active or command not found.
     */
    async getCommandInfo(command: AirPlay.Proto.Command): Promise<AirPlay.Proto.CommandInfo | null> {
        return getCommandInfo(this.#airplay.state, command);
    }

    /**
     * Checks whether a command is supported and enabled by the active player.
     *
     * @param command - The command to check.
     * @returns True if supported and enabled, false otherwise.
     */
    async isCommandSupported(command: AirPlay.Proto.Command): Promise<boolean> {
        return isCommandSupported(this.#airplay.state, command);
    }

    /** Emits 'connected' when both AirPlay and Companion Link are connected. */
    async #onConnected(): Promise<void> {
        if (!this.#airplay.isConnected || !this.#companionLink.isConnected) {
            return;
        }

        this.emit('connected');
    }

    /**
     * Handles disconnection from either protocol. Disconnects both sides
     * and emits 'disconnected'. Only fires once per disconnect cycle.
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
