import { EventEmitter } from 'node:events';
import { type DataStream, DataStreamMessage, type EventStream, Proto, Protocol } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, type AudioSource, type DeviceIdentity, type DiscoveryResult, type TimingServer, waitFor } from '@basmilius/apple-common';
import { AirPlayFeatureFlags } from '@basmilius/apple-common';
import { FEEDBACK_INTERVAL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import { AirPlayArtwork } from './airplay-artwork';
import { AirPlayRemote } from './airplay-remote';
import { AirPlayState } from './airplay-state';
import { AirPlayVolume } from './airplay-volume';

/**
 * Events emitted by AirPlayDevice.
 * - `connected` — emitted after the full protocol setup completes.
 * - `disconnected` — emitted when the connection is lost or explicitly closed.
 */
type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

/**
 * High-level abstraction for an AirPlay device (Apple TV or HomePod).
 * Manages the full lifecycle: connect, pair/verify, set up control/data/event streams,
 * and provides access to Remote, State, and Volume controllers.
 * Supports both transient (PIN-less) and credential-based pairing.
 */
export class AirPlayManager extends EventEmitter<EventMap> {
    /** @returns The underlying AirPlay Protocol instance (accessed via symbol for internal use). */
    get [PROTOCOL](): Protocol {
        return this.#protocol;
    }

    /** The mDNS discovery result used to connect to this device. */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /** Updates the discovery result, e.g. when the device's address changes. */
    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    /**
     * Device capabilities derived from the AirPlay feature flags.
     * Indicates which protocols and features the receiver supports.
     */
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
    } {
        const has = (f: bigint) => this.#protocol?.hasReceiverFeature(f) ?? false;

        return {
            supportsAudio: has(AirPlayFeatureFlags.SupportsAirPlayAudio),
            supportsBufferedAudio: has(AirPlayFeatureFlags.SupportsBufferedAudio),
            supportsPTP: has(AirPlayFeatureFlags.SupportsPTP),
            supportsRFC2198Redundancy: has(AirPlayFeatureFlags.SupportsRFC2198Redundancy),
            supportsHangdogRemoteControl: has(AirPlayFeatureFlags.SupportsHangdogRemoteControl),
            supportsUnifiedMediaControl: has(AirPlayFeatureFlags.SupportsUnifiedMediaControl),
            supportsTransientPairing: has(AirPlayFeatureFlags.SupportsHKPairingAndAccessControl),
            supportsSystemPairing: has(AirPlayFeatureFlags.SupportsSystemPairing),
            supportsCoreUtilsPairing: has(AirPlayFeatureFlags.SupportsCoreUtilsPairingAndEncryption)
        };
    }

    /** Whether the control stream TCP connection is currently active. */
    get isConnected(): boolean {
        return this.#protocol?.controlStream?.isConnected ?? false;
    }

    /** Raw receiver info dictionary from the /info endpoint, or undefined before connect. */
    get receiverInfo(): Record<string, any> | undefined {
        return this.#protocol?.receiverInfo;
    }

    /** The Artwork controller for fetching now-playing artwork from all sources. */
    get artwork(): AirPlayArtwork {
        return this.#artwork;
    }

    /** The Remote controller for HID keys, SendCommand, text input, and touch. */
    get remote(): AirPlayRemote {
        return this.#remote;
    }

    /** The State tracker for now-playing, volume, keyboard, and output device state. */
    get state(): AirPlayState {
        return this.#state;
    }

    /** The Volume controller for absolute and relative volume adjustments. */
    get volume(): AirPlayVolume {
        return this.#volume;
    }

    /** The shared PTP timing server, if one is assigned for multi-room sync. */
    get timingServer(): TimingServer | undefined {
        return this.#timingServer;
    }

    /** Assigns a PTP timing server for multi-room audio synchronization. */
    set timingServer(timingServer: TimingServer | undefined) {
        this.#timingServer = timingServer;
    }

    readonly #artwork: AirPlayArtwork;
    readonly #remote: AirPlayRemote;
    readonly #state: AirPlayState;
    readonly #volume: AirPlayVolume;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #identity?: Partial<DeviceIdentity>;
    #feedbackInterval: NodeJS.Timeout | undefined;
    #keys: AccessoryKeys;
    #lastArtworkId: string | null = null;
    #playUrlProtocol?: Protocol;
    #prevDataStream?: DataStream;
    #prevEventStream?: EventStream;
    #protocol!: Protocol;
    #streamProtocol?: Protocol;
    #streamFeedbackInterval?: NodeJS.Timeout;
    #timingServer?: TimingServer;

    /**
     * Creates a new AirPlayDevice.
     *
     * @param discoveryResult - The mDNS discovery result for the target device.
     * @param identity - Optional partial device identity to present during pairing.
     */
    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#identity = identity;
        this.#artwork = new AirPlayArtwork(this);
        this.#remote = new AirPlayRemote(this);
        this.#state = new AirPlayState(this);

        this.onClose = this.onClose.bind(this);
        this.onError = this.onError.bind(this);
        this.onNowPlayingChanged = this.onNowPlayingChanged.bind(this);
        this.onTimeout = this.onTimeout.bind(this);
        this.#volume = new AirPlayVolume(this);
    }

    /**
     * Connects to the AirPlay device, performs pairing/verification,
     * and sets up all streams (control, data, event). Emits 'connected' on success.
     * If credentials are set, uses pair-verify; otherwise uses transient pairing.
     */
    async connect(): Promise<void> {
        // Clean up old protocol before creating a new one.
        // Prevents stale close events and resource leaks (open sockets, timers).
        if (this.#protocol) {
            this.#protocol.controlStream.off('close', this.onClose);
            this.#protocol.controlStream.off('error', this.onError);
            this.#protocol.controlStream.off('timeout', this.onTimeout);

            try {
                this.#protocol.disconnect();
            } catch {
                // Best-effort cleanup of old protocol.
            }
        }

        this.#disconnect = false;
        this.#state.clear();

        this.#protocol = new Protocol(this.#discoveryResult, this.#identity);
        this.#protocol.controlStream.on('close', this.onClose);
        this.#protocol.controlStream.on('error', this.onError);
        this.#protocol.controlStream.on('timeout', this.onTimeout);

        await this.#protocol.connect();
        await this.#protocol.fetchInfo();

        if (this.#credentials) {
            this.#keys = await this.#protocol.verify.start(this.#credentials);
        } else {
            await this.#protocol.pairing.start();
            this.#keys = await this.#protocol.pairing.transient();
        }

        await this.#setup();

        this.emit('connected');
    }

    /** Gracefully disconnects from the device, clears intervals, and tears down all streams. */
    disconnect(): void {
        this.#disconnect = true;

        if (this.#feedbackInterval) {
            clearInterval(this.#feedbackInterval);
            this.#feedbackInterval = undefined;
        }

        this.#cleanupPlayUrl();
        this.#cleanupStream();
        this.#unsubscribe();
        this.#protocol.disconnect();
        this.emit('disconnected', false);
    }

    /** Disconnects gracefully, swallowing any errors during cleanup. */
    disconnectSafely(): void {
        try {
            this.disconnect();
        } catch (err) {
            this.#protocol?.context?.logger?.warn('[device]', 'Error during safe disconnect', err);
        }
    }

    /**
     * Enables or disables conversation detection on the output device (HomePod feature).
     *
     * @param enabled - Whether to enable conversation detection.
     * @throws Error when no output device is active.
     */
    async setConversationDetectionEnabled(enabled: boolean): Promise<void> {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (!outputDeviceUID) {
            throw new Error('No output device active.');
        }

        await this.#protocol.dataStream.send(DataStreamMessage.setConversationDetectionEnabled(enabled, outputDeviceUID));
    }

    /**
     * Adds devices to the current multi-room output context.
     *
     * @param deviceUIDs - UIDs of the devices to add.
     */
    async addOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext(deviceUIDs));
    }

    /**
     * Removes devices from the current multi-room output context.
     *
     * @param deviceUIDs - UIDs of the devices to remove.
     */
    async removeOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext([], deviceUIDs));
    }

    /**
     * Replaces the entire multi-room output context with the given devices.
     *
     * @param deviceUIDs - UIDs of the devices to set as the output context.
     */
    async setOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext([], [], deviceUIDs));
    }

    /**
     * Plays a URL on the device (the device fetches and plays the content).
     * Creates a separate Protocol instance to avoid conflicting with the
     * existing remote control session, following the same approach as pyatv.
     *
     * @param url - The media URL to play.
     * @param position - Start position in seconds (defaults to 0).
     * @throws Error when not connected.
     */
    async playUrl(url: string, position: number = 0): Promise<void> {
        if (!this.#keys) {
            throw new Error('Not connected. Call connect() first.');
        }

        // Create a separate protocol instance for URL playback,
        // just like pyatv does. This avoids conflicting with the
        // existing remote control session.
        this.#playUrlProtocol?.disconnect();

        const playProtocol = new Protocol(this.#discoveryResult, this.#identity);

        if (this.#timingServer) {
            playProtocol.useTimingServer(this.#timingServer);
        }

        try {
            await playProtocol.connect();
            await playProtocol.fetchInfo();

            let keys: AccessoryKeys;

            if (this.#credentials) {
                keys = await playProtocol.verify.start(this.#credentials);
            } else {
                await playProtocol.pairing.start();
                keys = await playProtocol.pairing.transient();
            }

            playProtocol.controlStream.enableEncryption(
                keys.accessoryToControllerKey,
                keys.controllerToAccessoryKey
            );

            this.#playUrlProtocol = playProtocol;

            await playProtocol.playUrl(url, keys.sharedSecret, keys.pairingId, position);
        } catch (err) {
            if (this.#playUrlProtocol !== playProtocol) {
                playProtocol.disconnect();
            }

            throw err;
        }
    }

    /** Waits for the current URL playback to finish, then cleans up the play URL protocol. */
    async waitForPlaybackEnd(): Promise<void> {
        if (!this.#playUrlProtocol) {
            return;
        }

        try {
            await this.#playUrlProtocol.waitForPlaybackEnd();
        } finally {
            this.#cleanupPlayUrl();
        }
    }

    /** Stops the current URL playback and cleans up the dedicated play URL protocol. */
    stopPlayUrl(): void {
        this.#cleanupPlayUrl();
    }

    /** Stops, disconnects, and discards the dedicated play URL protocol instance. */
    #cleanupPlayUrl(): void {
        if (this.#playUrlProtocol) {
            this.#playUrlProtocol.stopPlayUrl();
            this.#playUrlProtocol.disconnect();
            this.#playUrlProtocol = undefined;
        }
    }

    /**
     * Streams audio from a source to the device via RAOP/RTP.
     * Creates a separate Protocol instance to avoid conflicting with the
     * existing remote control session, following the same approach as playUrl.
     *
     * @param source - The audio source to stream (e.g. MP3, WAV, URL, live).
     */
    async streamAudio(source: AudioSource): Promise<void> {
        if (!this.#keys) {
            throw new Error('Not connected. Call connect() first.');
        }

        this.#cleanupStream();

        const streamProtocol = new Protocol(this.#discoveryResult, this.#identity);

        if (this.#timingServer) {
            streamProtocol.useTimingServer(this.#timingServer);
        }

        try {
            await streamProtocol.connect();
            await streamProtocol.fetchInfo();

            let keys: AccessoryKeys;

            if (this.#credentials) {
                keys = await streamProtocol.verify.start(this.#credentials);
            } else {
                await streamProtocol.pairing.start();
                keys = await streamProtocol.pairing.transient();
            }

            streamProtocol.controlStream.enableEncryption(
                keys.accessoryToControllerKey,
                keys.controllerToAccessoryKey
            );

            this.#streamProtocol = streamProtocol;

            await streamProtocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

            this.#streamFeedbackInterval = setInterval(async () => {
                try {
                    await streamProtocol.feedback();
                } catch {
                    // Best-effort keepalive; errors are non-fatal.
                }
            }, FEEDBACK_INTERVAL);

            await streamProtocol.setupAudioStream(source);
        } catch (err) {
            if (this.#streamProtocol !== streamProtocol) {
                streamProtocol.disconnect();
            }

            throw err;
        } finally {
            this.#cleanupStream();
        }
    }

    /** Stops the current audio stream and cleans up the dedicated stream protocol. */
    stopStreamAudio(): void {
        this.#cleanupStream();
    }

    /** Stops, disconnects, and discards the dedicated audio stream protocol instance. */
    #cleanupStream(): void {
        if (this.#streamFeedbackInterval) {
            clearInterval(this.#streamFeedbackInterval);
            this.#streamFeedbackInterval = undefined;
        }

        if (this.#streamProtocol) {
            this.#streamProtocol.disconnect();
            this.#streamProtocol = undefined;
        }
    }

    /**
     * Sets the audio listening mode on the device (HomePod).
     *
     * @param mode - Listening mode string (e.g. 'Default', 'Vivid', 'LateNight').
     */
    async setListeningMode(mode: string): Promise<void> {
        const uid = this.state.outputDeviceUID;

        if (uid) {
            await this.#protocol.dataStream.send(DataStreamMessage.setListeningMode(mode, uid));
        }
    }

    /**
     * Sets the audio routing mode on the receiver via the control stream.
     *
     * @param mode - Audio mode (e.g. 'default', 'moviePlayback', 'spoken').
     */
    async setAudioMode(mode: string): Promise<void> {
        await this.#protocol.controlStream.setAudioMode(mode);
    }

    /**
     * Triggers an audio fade on the device.
     *
     * @param fadeType - The fade type (0 = fade out, 1 = fade in).
     */
    async audioFade(fadeType: number): Promise<void> {
        await this.#protocol.dataStream.send(DataStreamMessage.audioFade(fadeType));
    }

    /**
     * Wakes the device from sleep via the DataStream.
     */
    async wake(): Promise<void> {
        await this.#protocol.dataStream.send(DataStreamMessage.wakeDevice());
    }

    /**
     * Requests the playback queue from the device.
     *
     * @param length - Maximum number of queue items to retrieve.
     */
    async requestPlaybackQueue(length: number): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.playbackQueueRequest(0, length));
    }

    /**
     * Sends a raw MRP command to the device via the DataStream.
     *
     * @param command - The command to send.
     * @param options - Optional command options.
     */
    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.sendCommand(command, options));
    }

    /**
     * Sets the pairing credentials for pair-verify authentication.
     * Must be called before connect() if credential-based pairing is desired.
     *
     * @param credentials - The accessory credentials obtained from pair-setup.
     */
    setCredentials(credentials: AccessoryCredentials): void {
        this.#credentials = credentials;
    }

    /** Sends a periodic feedback request to keep the AirPlay session alive. */
    async #feedback(): Promise<void> {
        try {
            await this.#protocol.feedback();
        } catch (err) {
            this.#protocol.context.logger.error('Feedback error', err);
        }
    }

    /** Handles the control stream close event. Emits 'disconnected' with unexpected=true if not intentional. */
    onClose(): void {
        this.#protocol.context.logger.net('onClose() called on airplay device.');

        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;
        this.disconnectSafely();
        this.emit('disconnected', true);
    }

    /**
     * Handles stream error events by logging them.
     *
     * @param err - The error that occurred.
     */
    onError(err: Error): void {
        this.#protocol.context.logger.error('AirPlay error', err);
    }

    /** Handles now-playing changes to auto-fetch artwork on track changes. */
    onNowPlayingChanged(_client: any, player: any): void {
        const artworkId = player?.artworkId ?? null;

        if (artworkId !== this.#lastArtworkId) {
            this.#lastArtworkId = artworkId;
            this.requestPlaybackQueue(1).catch(() => {});
        }
    }

    /** Handles stream timeout events by destroying the control stream. */
    onTimeout(): void {
        this.#protocol.context.logger.error('AirPlay timeout');
        this.#protocol.controlStream.destroy();
    }

    /**
     * Sets up encryption, event/data streams, feedback interval, and initial state subscriptions.
     * Called after successful pairing/verification.
     */
    async #setup(): Promise<void> {
        const keys = this.#keys;

        this.#protocol.controlStream.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        this.#unsubscribe();

        if (this.#timingServer) {
            this.#protocol.useTimingServer(this.#timingServer);
        }

        try {
            // Remove listeners from previous streams (prevents accumulation on reconnect).
            this.#prevDataStream?.off('error', this.onError);
            this.#prevDataStream?.off('timeout', this.onTimeout);
            this.#prevEventStream?.off('error', this.onError);
            this.#prevEventStream?.off('timeout', this.onTimeout);

            await this.#protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
            await this.#protocol.setupDataStream(keys.sharedSecret, () => this.#subscribe());

            this.#protocol.dataStream.on('error', this.onError);
            this.#protocol.dataStream.on('timeout', this.onTimeout);
            this.#protocol.eventStream.on('error', this.onError);
            this.#protocol.eventStream.on('timeout', this.onTimeout);

            this.#prevDataStream = this.#protocol.dataStream;
            this.#prevEventStream = this.#protocol.eventStream;

            if (this.#feedbackInterval) {
                clearInterval(this.#feedbackInterval);
            }

            this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

            await this.#protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId, this.#protocol.context.identity));
            this.#protocol.dataStream.send(DataStreamMessage.setConnectionState());
            this.#protocol.dataStream.send(DataStreamMessage.clientUpdatesConfig(true, true, true, true));
            await this.#protocol.dataStream.exchange(DataStreamMessage.getState());

            // Auto-fetch playback queue (with artwork) on track changes.
            // Only fetch when artwork might have changed (different artworkId or no artwork yet).
            this.#lastArtworkId = null;
            this.#state.on('nowPlayingChanged', this.onNowPlayingChanged);

            this.#protocol.context.logger.info('Protocol ready.');
        } catch (err) {
            if (this.#feedbackInterval) {
                clearInterval(this.#feedbackInterval);
                this.#feedbackInterval = undefined;
            }

            this.#protocol.context.logger.error('[device]', 'Setup failed, cleaning up', err);
            this.#protocol.disconnect();

            throw err;
        }
    }

    /** Subscribes the state tracker to DataStream events. */
    #subscribe(): void {
        this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    /** Unsubscribes the state tracker from DataStream events. */
    #unsubscribe(): void {
        try {
            this.#state.off('nowPlayingChanged', this.onNowPlayingChanged);
            this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
        } catch (err) {
            this.#protocol.context.logger.error('State unsubscribe error', err);
        }
    }
}
