import { EventEmitter } from 'node:events';
import { Proto } from '@basmilius/apple-airplay';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import { AirPlayDevice } from '../airplay';
import { CompanionLinkDevice } from '../companion-link';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default class extends EventEmitter<EventMap> {
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    get companionLink(): CompanionLinkDevice {
        return this.#companionLink;
    }

    get bundleIdentifier(): string | null {
        return this.#airplay.state.nowPlayingClient?.bundleIdentifier ?? null;
    }

    get displayName(): string | null {
        return this.#airplay.state.nowPlayingClient?.displayName ?? null;
    }

    get isConnected(): boolean {
        return this.#airplay.isConnected && this.#companionLink.isConnected;
    }

    get isPlaying(): boolean {
        return this.playbackState === Proto.PlaybackState_Enum.Playing;
    }

    get playbackQueue(): Proto.PlaybackQueue | null {
        return this.#airplay.state.nowPlayingClient?.playbackQueue ?? null;
    }

    get playbackState(): Proto.PlaybackState_Enum {
        return this.#airplay.state.nowPlayingClient?.playbackState ?? Proto.PlaybackState_Enum.Unknown;
    }

    get playbackStateTimestamp(): number {
        return this.#airplay.state.nowPlayingClient?.playbackStateTimestamp ?? -1;
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
    }

    async connect(credentials: AccessoryCredentials): Promise<void> {
        await this.#airplay.setCredentials(credentials);
        await this.#companionLink.setCredentials(credentials);

        await this.#airplay.connect();
        await this.#companionLink.connect();

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
        await this.#airplay.sendCommand(Proto.Command.Pause);
    }

    async playPause(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.TogglePlayPause);
    }

    async play(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.Play);
    }

    async stop(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.Stop);
    }

    async next(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.NextInContext);
    }

    async previous(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.PreviousInContext);
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

    async getCommandInfo(command: Proto.Command): Promise<Proto.CommandInfo | null> {
        const client = this.#airplay.state.nowPlayingClient;

        if (!client) {
            return null;
        }

        return client.supportedCommands.find(c => c.command === command) ?? null;
    }

    async isCommandSupported(command: Proto.Command): Promise<boolean> {
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
