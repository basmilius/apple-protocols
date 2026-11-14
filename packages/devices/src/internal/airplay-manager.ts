import { EventEmitter } from 'node:events';
import { AirPlayFeatureFlags, type AirPlaySession, type AudioPlayback, type AudioSource, connect, type DataChannel, DataStreamMessage, Proto, type TimingServer, toTarget, type UrlPlayback } from '@corewire/airplay';
import { ConnectionClosedError } from '@corewire/core';
import type { DiscoveryResult } from '@corewire/core/discovery';
import type { AccessoryCredentials } from '@corewire/core/pairing';
import { Context, type DeviceIdentity } from '@corewire/core/transport';
import { AirPlayArtwork } from './airplay-artwork';
import { AirPlayRemote } from './airplay-remote';
import { AirPlayState } from './airplay-state';
import { AirPlayVolume } from './airplay-volume';
import { MRP_CHANNEL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';

/**
 * Events emitted by AirPlayManager.
 * - `connected` — emitted after the full protocol setup completes.
 * - `disconnected` — emitted when the connection is lost (`true`) or explicitly closed (`false`).
 */
type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

/** What the AirPlay controllers need from the manager: the MRP data channel and the logging context. */
export type MrpAccess = {
    readonly context: Context;

    /** Undefined before the first connect and after a disconnect. */
    readonly dataStream: DataChannel | undefined;
};

/**
 * Keeps one AirPlay session to an Apple TV or HomePod, with remote control open, and the
 * Remote, State, Volume and Artwork controllers on top. Pair-verify with credentials, transient
 * pairing without. Every connect builds a new session; nothing reconnects by itself.
 */
export class AirPlayManager extends EventEmitter<EventMap> {
    /** The current AirPlay session; the last one stays readable after a disconnect. */
    get [PROTOCOL](): AirPlaySession | undefined {
        return this.#session;
    }

    get [MRP_CHANNEL](): MrpAccess {
        return {
            context: this.#context,
            dataStream: this.#data
        };
    }

    /** The running {@link streamAudio} stream, or undefined when nothing streams. Diagnostics reads its `stats`. */
    get audioPlayback(): AudioPlayback | undefined {
        return this.#audio;
    }

    /** The mDNS discovery result the next connect uses. */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /** Updates the discovery result, e.g. when the device's address changes. Takes effect on the next connect. */
    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    /** Device capabilities from the `/info` feature flags of the last session. */
    get capabilities(): {
        supportsAudio: boolean;
        supportsBufferedAudio: boolean;
        supportsPTP: boolean;
        supportsRFC2198Redundancy: boolean;
        supportsHangdogRemoteControl: boolean;
        supportsUnifiedMediaControl: boolean;
        supportsTransientPairing: boolean;
        supportsSystemPairing: boolean;
        supportsCoreUtilsPairing: boolean;
        supportsUrlPlayback: boolean;
    } {
        const has = (feature: bigint): boolean => this.#session?.hasFeature(feature) ?? false;

        return {
            supportsAudio: has(AirPlayFeatureFlags.SupportsAirPlayAudio),
            supportsBufferedAudio: has(AirPlayFeatureFlags.SupportsBufferedAudio),
            supportsPTP: has(AirPlayFeatureFlags.SupportsPTP),
            supportsRFC2198Redundancy: has(AirPlayFeatureFlags.SupportsRFC2198Redundancy),
            supportsHangdogRemoteControl: has(AirPlayFeatureFlags.SupportsHangdogRemoteControl),
            supportsUnifiedMediaControl: has(AirPlayFeatureFlags.SupportsUnifiedMediaControl),
            supportsTransientPairing: has(AirPlayFeatureFlags.SupportsHKPairingAndAccessControl),
            supportsSystemPairing: has(AirPlayFeatureFlags.SupportsSystemPairing),
            supportsCoreUtilsPairing: has(AirPlayFeatureFlags.SupportsCoreUtilsPairingAndEncryption),
            supportsUrlPlayback: this.#session?.supportsUrlPlayback ?? false
        };
    }

    /** Whether setup completed and the control, data and event channels are all connected. */
    get isConnected(): boolean {
        const session = this.#session;

        return this.#ready && !this.#disconnect
            && !!session?.isOpen
            && session.control.isConnected
            && !!this.#data?.isConnected
            && !!session.remoteControl?.events.isConnected;
    }

    /** The `/info` plist of the last session, or undefined before the first connect. */
    get receiverInfo(): Record<string, any> | undefined {
        return this.#session?.info;
    }

    get artwork(): AirPlayArtwork {
        return this.#artwork;
    }

    get remote(): AirPlayRemote {
        return this.#remote;
    }

    get state(): AirPlayState {
        return this.#state;
    }

    get volume(): AirPlayVolume {
        return this.#volume;
    }

    /** The NTP timing server the next connect announces in its SETUP requests. */
    get timingServer(): TimingServer | undefined {
        return this.#timingServer;
    }

    set timingServer(timingServer: TimingServer | undefined) {
        this.#timingServer = timingServer;
    }

    readonly #artwork: AirPlayArtwork;
    readonly #identity?: Partial<DeviceIdentity>;
    readonly #remote: AirPlayRemote;
    readonly #state: AirPlayState;
    readonly #volume: AirPlayVolume;
    readonly #nowPlayingListener = (_client: unknown, player: {artworkId?: string | null} | null): void => this.#onNowPlayingChanged(player);
    #abort?: AbortController;
    #audio?: AudioPlayback;
    #audioAbort?: AbortController;
    #connecting?: Promise<void>;
    #context: Context;
    #credentials?: AccessoryCredentials;
    #data?: DataChannel;
    #disconnect: boolean = true;
    #discoveryResult: DiscoveryResult;
    #lastArtworkId: string | null = null;
    #playUrl?: UrlPlayback;
    #playUrlAbort?: AbortController;
    #ready: boolean = false;
    #session?: AirPlaySession;
    #timingServer?: TimingServer;

    /**
     * @param discoveryResult - The mDNS discovery result for the target device.
     * @param identity - Optional partial device identity to present during pairing.
     */
    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#identity = identity;
        this.#context = new Context(discoveryResult.id, identity);
        this.#artwork = new AirPlayArtwork(this);
        this.#remote = new AirPlayRemote(this);
        this.#state = new AirPlayState(this);
        this.#volume = new AirPlayVolume(this);
    }

    /**
     * Connects, verifies or pairs transiently, opens remote control and emits `connected`.
     * Concurrent calls share one attempt. On a live session this first disconnects, which emits
     * `disconnected(false)`; a failed attempt emits `disconnected(false)` too.
     */
    async connect(): Promise<void> {
        if (this.#connecting) {
            return this.#connecting;
        }

        const connecting = this.#connect();
        this.#connecting = connecting;

        try {
            await connecting;
        } finally {
            this.#connecting = undefined;
        }
    }

    async #connect(): Promise<void> {
        if (!this.#disconnect) {
            this.disconnect();
        }

        this.#disconnect = false;
        this.#ready = false;
        this.#state.clear();

        const abort = new AbortController();
        this.#abort = abort;
        this.#context = new Context(this.#discoveryResult.id, this.#identity);

        const assertCurrent = (): void => {
            if (this.#abort !== abort || this.#disconnect) {
                throw new ConnectionClosedError('AirPlay setup was interrupted.');
            }
        };

        let session: AirPlaySession | undefined;

        try {
            session = await connect(toTarget(this.#discoveryResult), {
                credentials: this.#credentials,
                context: this.#context,
                timing: this.#timingServer,
                signal: abort.signal
            });
            assertCurrent();

            const current = session;
            this.#session = current;

            // A close we did not ask for is unexpected; our own teardown already went through #endSession.
            current.on('closed', reason => {
                if (this.#session === current) {
                    this.#endSession(reason !== 'local');
                }
            });

            this.#unsubscribe();

            await current.openRemoteControl({
                subscribe: data => {
                    if (!this.#disconnect && this.#session === current) {
                        this.#data = data;
                        this.#subscribe();
                    }
                }
            });
            assertCurrent();

            // Fetch the playback queue when the artwork ID changes or artwork is missing.
            this.#lastArtworkId = null;
            this.#state.on('nowPlayingChanged', this.#nowPlayingListener);

            this.#ready = true;
        } catch (error) {
            if (this.#abort === abort) {
                this.disconnectSafely();
            } else {
                void session?.close();
            }

            throw error;
        }

        this.emit('connected');
    }

    /** Tears the session down and emits `disconnected(false)`. Synchronous. */
    disconnect(): void {
        this.#endSession(false);
    }

    /** {@link disconnect}, logging instead of throwing. */
    disconnectSafely(): void {
        try {
            this.disconnect();
        } catch (err) {
            this.#context.logger.warn('[device]', 'Error during safe disconnect', err);
        }
    }

    /**
     * Enables or disables conversation detection on the output device (HomePod feature).
     *
     * @throws Error when no output device is active.
     */
    async setConversationDetectionEnabled(enabled: boolean): Promise<void> {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (!outputDeviceUID) {
            throw new Error('No output device active.');
        }

        await this.#data.send(DataStreamMessage.setConversationDetectionEnabled(enabled, outputDeviceUID));
    }

    /** Adds devices to the current multi-room output context. */
    async addOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#data.exchange(DataStreamMessage.modifyOutputContext(deviceUIDs));
    }

    /** Removes devices from the current multi-room output context. */
    async removeOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#data.exchange(DataStreamMessage.modifyOutputContext([], deviceUIDs));
    }

    /** Replaces the multi-room output context with the given devices. */
    async setOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#data.exchange(DataStreamMessage.modifyOutputContext([], [], deviceUIDs));
    }

    /**
     * Plays a URL on the device, which fetches the content itself, on a connection of its own so
     * remote control stays untouched. A previous URL playback stops first.
     *
     * @param position - Start position in seconds.
     * @throws Error when never connected.
     */
    async playUrl(url: string, position: number = 0): Promise<void> {
        const session = this.#session;

        if (!session) {
            throw new Error('Not connected. Call connect() first.');
        }

        this.#cleanupPlayUrl();

        const abort = new AbortController();
        this.#playUrlAbort = abort;

        try {
            const playback = await session.playUrl(url, {position, signal: abort.signal});

            if (this.#playUrlAbort !== abort) {
                playback.stop();

                throw new ConnectionClosedError('URL playback cancelled.');
            }

            this.#playUrl = playback;
        } catch (err) {
            if (this.#playUrlAbort === abort) {
                this.#playUrlAbort = undefined;
            }

            throw err;
        }
    }

    /** Waits for the current URL playback to finish, then cleans it up unless a newer one replaced it. */
    async waitForPlaybackEnd(): Promise<void> {
        const playback = this.#playUrl;

        if (!playback) {
            return;
        }

        try {
            await playback.waitForEnd();
        } finally {
            // A newer playUrl may have replaced the playback in the meantime; leave that one playing.
            if (this.#playUrl === playback) {
                this.#cleanupPlayUrl();
            }
        }
    }

    /** Stops the current URL playback and closes its connection. */
    stopPlayUrl(): void {
        this.#cleanupPlayUrl();
    }

    #cleanupPlayUrl(): void {
        this.#playUrlAbort?.abort();
        this.#playUrlAbort = undefined;
        this.#playUrl?.stop();
        this.#playUrl = undefined;
    }

    /**
     * Streams audio to the device on a connection of its own and resolves when the source has
     * ended and the stream is torn down. A previous stream stops first.
     *
     * @param volumeDb - Stream volume in dB (-144 = mute, 0 = max). A fresh audio session starts
     *   silent, so an audible default is applied.
     */
    async streamAudio(source: AudioSource, volumeDb: number = -20): Promise<void> {
        const session = this.#session;

        if (!session) {
            throw new Error('Not connected. Call connect() first.');
        }

        this.#cleanupStream();

        const abort = new AbortController();
        this.#audioAbort = abort;

        try {
            const playback = await session.streamAudio(source, {volumeDb, signal: abort.signal});

            if (this.#audioAbort !== abort) {
                playback.stop();

                throw new ConnectionClosedError('Audio stream cancelled.');
            }

            this.#audio = playback;

            await playback.finished;
        } finally {
            if (this.#audioAbort === abort) {
                this.#cleanupStream();
            }
        }
    }

    /** Stops the current audio stream and closes its connection. */
    stopStreamAudio(): void {
        this.#cleanupStream();
    }

    #cleanupStream(): void {
        this.#audioAbort?.abort();
        this.#audioAbort = undefined;
        this.#audio?.stop();
        this.#audio = undefined;
    }

    /** Sets the audio listening mode on the device (HomePod), e.g. 'Default', 'Vivid', 'LateNight'. */
    async setListeningMode(mode: string): Promise<void> {
        const uid = this.state.outputDeviceUID;

        if (uid) {
            await this.#data.send(DataStreamMessage.setListeningMode(mode, uid));
        }
    }

    /** Sets the audio routing mode on the receiver, e.g. 'default', 'moviePlayback', 'spoken'. */
    async setAudioMode(mode: string): Promise<void> {
        await this.#session.control.setAudioMode(mode);
    }

    /** Triggers an audio fade on the device (0 = fade out, 1 = fade in). */
    async audioFade(fadeType: number): Promise<void> {
        await this.#data.send(DataStreamMessage.audioFade(fadeType));
    }

    /** Wakes the device from sleep. */
    async wake(): Promise<void> {
        await this.#data.send(DataStreamMessage.wakeDevice());
    }

    /** Requests the playback queue from the device, up to `length` items. */
    async requestPlaybackQueue(length: number): Promise<void> {
        await this.#data.exchange(DataStreamMessage.playbackQueueRequest(0, length));
    }

    /** Requests assets for the captured item; a track change invalidates the result. */
    async requestContentItemAssets(options: Partial<DataStreamMessage.PlaybackQueueAssetOptions> = {}, width: number = 600, height: number = -1): Promise<Proto.ContentItem | null> {
        const player = this.#state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;

        if (!identifier) {
            return null;
        }

        // TVMusic returns sparse metadata for identifier-only requests; request the current queue window.
        const response = await this.#data.exchange(DataStreamMessage.playbackQueueRequest(0, 1, width, height, {
            ...options,
            playerPath: player.playbackQueue?.resolvedPlayerPath
        }));

        if (response.errorCode) {
            throw new Error(`Content item request failed: ${response.errorDescription || response.errorCode}`);
        }

        if (this.#state.nowPlayingClient?.activePlayer !== player || player.currentItem?.identifier !== identifier) {
            return null;
        }

        return player.currentItem;
    }

    /** Sends a raw MRP command. */
    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#data.exchange(DataStreamMessage.sendCommand(command, options));
    }

    /** The credentials the next connect uses for pair-verify; without them it pairs transiently. */
    setCredentials(credentials: AccessoryCredentials): void {
        this.#credentials = credentials;
    }

    #endSession(unexpected: boolean): void {
        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;
        this.#ready = false;

        const session = this.#session;

        this.#abort?.abort();
        this.#abort = undefined;
        this.#cleanupPlayUrl();
        this.#cleanupStream();
        this.#unsubscribe();
        this.#data = undefined;
        this.#artwork.clear();

        try {
            void session?.close();
        } finally {
            this.emit('disconnected', unexpected);
        }
    }

    /** Fetches the playback queue on a track change, so artwork arrives. */
    #onNowPlayingChanged(player: {artworkId?: string | null} | null): void {
        const artworkId = player?.artworkId ?? null;

        if (artworkId !== this.#lastArtworkId) {
            this.#lastArtworkId = artworkId;
            this.requestPlaybackQueue(1).catch(() => {
            });
        }
    }

    #subscribe(): void {
        this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    #unsubscribe(): void {
        try {
            this.#state.off('nowPlayingChanged', this.#nowPlayingListener);
            this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
        } catch (err) {
            this.#context.logger.error('State unsubscribe error', err);
        }
    }
}
