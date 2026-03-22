import { EventEmitter } from 'node:events';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import * as AirPlay from '@basmilius/apple-airplay';
import type { AttentionState, LaunchableApp, TextInputState, UserAccount } from '@basmilius/apple-companion-link';
import type Client from '../airplay/client';
import { AirPlayDevice } from '../airplay';
import type Remote from '../airplay/remote';
import type State from '../airplay/state';
import type Volume from '../airplay/volume';
import { CompanionLinkDevice } from '../companion-link';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    power: [AttentionState];
    textInput: [TextInputState];
};

export default class extends EventEmitter<EventMap> {
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    get companionLink(): CompanionLinkDevice {
        return this.#companionLink;
    }

    get remote(): Remote {
        return this.#airplay.remote;
    }

    get state(): State {
        return this.#airplay.state;
    }

    get volumeControl(): Volume {
        return this.#airplay.volume;
    }

    get bundleIdentifier(): string | null {
        return this.#nowPlayingClient?.bundleIdentifier ?? null;
    }

    get displayName(): string | null {
        return this.#nowPlayingClient?.displayName ?? null;
    }

    get isConnected(): boolean {
        return this.#airplay.isConnected && this.#companionLink.isConnected;
    }

    get isPlaying(): boolean {
        return this.#nowPlayingClient?.isPlaying ?? false;
    }

    get title(): string {
        return this.#nowPlayingClient?.title ?? '';
    }

    get artist(): string {
        return this.#nowPlayingClient?.artist ?? '';
    }

    get album(): string {
        return this.#nowPlayingClient?.album ?? '';
    }

    get duration(): number {
        return this.#nowPlayingClient?.duration ?? 0;
    }

    get elapsedTime(): number {
        return this.#nowPlayingClient?.elapsedTime ?? 0;
    }

    get playbackQueue(): AirPlay.Proto.PlaybackQueue | null {
        return this.#nowPlayingClient?.playbackQueue ?? null;
    }

    get playbackState(): AirPlay.Proto.PlaybackState_Enum {
        return this.#nowPlayingClient?.playbackState ?? AirPlay.Proto.PlaybackState_Enum.Unknown;
    }

    get playbackStateTimestamp(): number {
        return this.#nowPlayingClient?.playbackStateTimestamp ?? -1;
    }

    get volume(): number {
        return this.#airplay.state.volume ?? 0;
    }

    get #nowPlayingClient(): Client | null {
        return this.#airplay.state.nowPlayingClient;
    }

    readonly #airplay: AirPlayDevice;
    readonly #companionLink: CompanionLinkDevice;
    #disconnect: boolean = false;

    constructor(airplayDiscoveryResult: DiscoveryResult, companionLinkDiscoveryResult: DiscoveryResult) {
        super();

        this.#airplay = new AirPlayDevice(airplayDiscoveryResult);
        this.#companionLink = new CompanionLinkDevice(companionLinkDiscoveryResult);

        this.#airplay.on('connected', () => this.#onConnected());
        this.#airplay.on('disconnected', unexpected => this.#onDisconnected(unexpected));
        this.#companionLink.on('connected', () => this.#onConnected());
        this.#companionLink.on('disconnected', unexpected => this.#onDisconnected(unexpected));
        this.#companionLink.on('power', state => this.emit('power', state));
        this.#companionLink.on('textInput', state => this.emit('textInput', state));
    }

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

    async disconnect(): Promise<void> {
        await this.#airplay.disconnect();
        await this.#companionLink.disconnect();
    }

    async turnOff(): Promise<void> {
        await this.#airplay.remote.suspend();
    }

    async turnOn(): Promise<void> {
        await this.#airplay.remote.wake();
    }

    async pause(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Pause);
    }

    async playPause(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.TogglePlayPause);
    }

    async play(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Play);
    }

    async stop(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.Stop);
    }

    async next(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.NextInContext);
    }

    async previous(): Promise<void> {
        await this.#airplay.sendCommand(AirPlay.Proto.Command.PreviousInContext);
    }

    async volumeDown(): Promise<void> {
        await this.#airplay.remote.volumeDown();
    }

    async volumeMute(): Promise<void> {
        await this.#airplay.remote.mute();
    }

    async volumeUp(): Promise<void> {
        await this.#airplay.remote.volumeUp();
    }

    async getAttentionState(): Promise<AttentionState> {
        return await this.#companionLink.getAttentionState();
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#companionLink.getLaunchableApps();
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#companionLink.getUserAccounts();
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#companionLink.launchApp(bundleId);
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#companionLink.switchUserAccount(accountId);
    }

    async textSet(text: string): Promise<void> {
        await this.#companionLink.textSet(text);
    }

    async textAppend(text: string): Promise<void> {
        await this.#companionLink.textAppend(text);
    }

    async textClear(): Promise<void> {
        await this.#companionLink.textClear();
    }

    async getCommandInfo(command: AirPlay.Proto.Command): Promise<AirPlay.Proto.CommandInfo | null> {
        const client = this.#airplay.state.nowPlayingClient;

        if (!client) {
            return null;
        }

        return client.supportedCommands.find(c => c.command === command) ?? null;
    }

    async isCommandSupported(command: AirPlay.Proto.Command): Promise<boolean> {
        const client = this.#airplay.state.nowPlayingClient;

        if (!client) {
            return false;
        }

        return client.isCommandSupported(command);
    }

    async #onConnected(): Promise<void> {
        if (!this.#airplay.isConnected || !this.#companionLink.isConnected) {
            return;
        }

        this.emit('connected');
    }

    async #onDisconnected(unexpected: boolean): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;

        await this.disconnect();
        this.emit('disconnected', unexpected);
    }
}
