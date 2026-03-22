import { EventEmitter } from 'node:events';
import type { AudioSource, DiscoveryResult } from '@basmilius/apple-common';
import * as AirPlay from '@basmilius/apple-airplay';
import { type AirPlayClient, AirPlayDevice, type AirPlayRemote, type AirPlayState, type AirPlayVolume } from '../airplay';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default abstract class extends EventEmitter<EventMap> {
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    get remote(): AirPlayRemote {
        return this.#airplay.remote;
    }

    get state(): AirPlayState {
        return this.#airplay.state;
    }

    get volumeControl(): AirPlayVolume {
        return this.#airplay.volume;
    }

    get bundleIdentifier(): string | null {
        return this.#nowPlayingClient?.bundleIdentifier ?? null;
    }

    get displayName(): string | null {
        return this.#nowPlayingClient?.displayName ?? null;
    }

    get isConnected(): boolean {
        return this.#airplay.isConnected;
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

    get #nowPlayingClient(): AirPlayClient | null {
        return this.#airplay.state.nowPlayingClient;
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

    async playUrl(url: string, position: number = 0): Promise<void> {
        await this.#airplay.playUrl(url, position);
    }

    async waitForPlaybackEnd(): Promise<void> {
        await this.#airplay.waitForPlaybackEnd();
    }

    stopPlayUrl(): void {
        this.#airplay.stopPlayUrl();
    }

    async streamAudio(source: AudioSource): Promise<void> {
        await this.#airplay.streamAudio(source);
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
