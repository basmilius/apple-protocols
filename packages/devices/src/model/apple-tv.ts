import { EventEmitter } from 'node:events';
import { Proto } from '@basmilius/apple-airplay';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import { AirPlayDevice } from '../airplay';
import { CompanionLinkDevice } from '../companion-link';

export default class extends EventEmitter {
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

    constructor(airplayDiscoveryResult: DiscoveryResult, companionLinkDiscoveryResult: DiscoveryResult) {
        super();

        this.#airplay = new AirPlayDevice(airplayDiscoveryResult);
        this.#companionLink = new CompanionLinkDevice(companionLinkDiscoveryResult);
    }

    async connect(credentials: AccessoryCredentials): Promise<void> {
        this.#airplay.on('connected', () => this.#onConnected());
        this.#airplay.on('disconnected', unexpected => this.#onDisconnected(unexpected));
        this.#companionLink.on('connected', () => this.#onConnected());
        this.#companionLink.on('disconnected', unexpected => this.#onDisconnected(unexpected));

        await this.#airplay.setCredentials(credentials);
        await this.#airplay.connect();

        await this.#companionLink.setCredentials(credentials);
        await this.#companionLink.connect();
    }

    async disconnect(): Promise<void> {
        await this.#airplay.disconnect();
        await this.#companionLink.disconnect();
    }

    async turnOff(): Promise<void> {
        await this.#companionLink.pressButton('Sleep');
    }

    async turnOn(): Promise<void> {
        await this.#companionLink.pressButton('Wake');
    }

    async pause(): Promise<void> {
        await this.#companionLink.mediaControlCommand('Pause');
    }

    async playPause(): Promise<void> {
        await this.#companionLink.pressButton('PlayPause');
    }

    async play(): Promise<void> {
        await this.#companionLink.mediaControlCommand('Play');
    }

    async stop(): Promise<void> {
        await this.#airplay.sendCommand(Proto.Command.Stop);
    }

    async next(): Promise<void> {
        await this.#companionLink.mediaControlCommand('NextTrack');
    }

    async previous(): Promise<void> {
        await this.#companionLink.mediaControlCommand('PreviousTrack');
    }

    async volumeDown(): Promise<void> {
        await this.#companionLink.pressButton('VolumeDown');
    }

    async volumeMute(): Promise<void> {
        await this.#companionLink.pressButton('PageUp');
    }

    async volumeUp(): Promise<void> {
        await this.#companionLink.pressButton('VolumeUp');
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
        this.emit('connected');
    }

    async #onDisconnected(unexpected: boolean): Promise<void> {
        this.emit('disconnected', unexpected);
    }
}
