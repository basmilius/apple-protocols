import { EventEmitter } from 'node:events';
import { Proto } from '@basmilius/apple-airplay';
import type { DiscoveryResult } from '@basmilius/apple-common';
import { AirPlayDevice } from '../airplay';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default abstract class extends EventEmitter<EventMap> {
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    get bundleIdentifier(): string | null {
        return this.#airplay.state.nowPlayingClient?.bundleIdentifier ?? null;
    }

    get displayName(): string | null {
        return this.#airplay.state.nowPlayingClient?.displayName ?? null;
    }

    get isConnected(): boolean {
        return this.#airplay.isConnected;
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

    get volume(): number {
        return this.#airplay.state.volume ?? 0;
    }

    readonly #airplay: AirPlayDevice;
    #disconnect: boolean = false;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#airplay = new AirPlayDevice(discoveryResult);
        this.#airplay.on('connected', () => this.#onConnected());
        this.#airplay.on('disconnected', unexpected => this.#onDisconnected(unexpected));
    }

    async connect(): Promise<void> {
        await this.#airplay.connect();
        this.#disconnect = false;
    }

    async disconnect(): Promise<void> {
        await this.#airplay.disconnect();
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
        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;

        await this.disconnect();
        this.emit('disconnected', unexpected);
    }
}
