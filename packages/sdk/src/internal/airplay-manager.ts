import { EventEmitter } from 'node:events';
import { type DataStream, DataStreamMessage, type EventStream, Proto, Protocol } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, AirPlayFeatureFlags, type AudioSource, ConnectionClosedError, type DeviceIdentity, type DiscoveryResult, type TimingServer } from '@basmilius/apple-common';
import { AirPlayArtwork } from './airplay-artwork';
import { AirPlayRemote } from './airplay-remote';
import { AirPlayState } from './airplay-state';
import { AirPlayVolume } from './airplay-volume';
import { FEEDBACK_INTERVAL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';

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
    /**
     * @returns The underlying AirPlay Protocol instance (accessed via symbol for internal use).
     */
    get [PROTOCOL](): Protocol {
        return this.#protocol;
    }

    /**
     * The dedicated protocol behind the running {@link streamAudio} session, or undefined when
     * nothing is streaming. Exposed so a diagnostics client can read `audioStream.stats`.
     */
    get streamProtocol(): Protocol | undefined {
        return this.#streamProtocol;
    }

    /**
     * The mDNS discovery result used to connect to this device.
     */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /**
     * Updates the discovery result, e.g. when the device's address changes.
     */
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

    /**
     * Whether setup completed and all required streams are connected.
     */
    get isConnected(): boolean {
        return this.#ready && !this.#disconnect
            && !!this.#protocol?.controlStream?.isConnected
            && !!this.#protocol?.dataStream?.isConnected
            && !!this.#protocol?.eventStream?.isConnected;
    }

    /**
     * Raw receiver info dictionary from the /info endpoint, or undefined before connect.
     */
    get receiverInfo(): Record<string, any> | undefined {
        return this.#protocol?.receiverInfo;
    }

    /**
     * The Artwork controller for fetching now-playing artwork from all sources.
     */
    get artwork(): AirPlayArtwork {
        return this.#artwork;
    }

    /**
     * The Remote controller for HID keys, SendCommand, text input, and touch.
     */
    get remote(): AirPlayRemote {
        return this.#remote;
    }

    /**
     * The State tracker for now-playing, volume, keyboard, and output device state.
     */
    get state(): AirPlayState {
        return this.#state;
    }

    /**
     * The Volume controller for absolute and relative volume adjustments.
     */
    get volume(): AirPlayVolume {
        return this.#volume;
    }

    /**
     * The shared PTP timing server, if one is assigned for multi-room sync.
     */
    get timingServer(): TimingServer | undefined {
        return this.#timingServer;
    }

    /**
     * Assigns a PTP timing server for multi-room audio synchronization.
     */
    set timingServer(timingServer: TimingServer | undefined) {
        this.#timingServer = timingServer;
    }

    readonly #artwork: AirPlayArtwork;
    readonly #remote: AirPlayRemote;
    readonly #state: AirPlayState;
    readonly #volume: AirPlayVolume;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = true;
    #ready: boolean = false;
    #connecting?: Promise<void>;
    #closeListeners: (() => void)[] = [];
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
        this.onStreamError = this.onStreamError.bind(this);
        this.onNowPlayingChanged = this.onNowPlayingChanged.bind(this);
        this.onTimeout = this.onTimeout.bind(this);
        this.onConnectionState = this.onConnectionState.bind(this);
        this.#volume = new AirPlayVolume(this);
    }

    /**
     * Connects to the AirPlay device, performs pairing/verification,
     * and sets up all streams (control, data, event). Emits 'connected' on success.
     * If credentials are set, uses pair-verify; otherwise uses transient pairing.
     */
    async connect(): Promise<void> {
        if (this.#connecting) return this.#connecting;
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

        const protocol = new Protocol(this.#discoveryResult, this.#identity);
        this.#protocol = protocol;
        this.#observeClose(protocol.controlStream, protocol);
        protocol.controlStream.on('error', this.onError);
        protocol.controlStream.on('timeout', this.onTimeout);

        const assertCurrent = (): void => {
            if (this.#protocol !== protocol || this.#disconnect) {
                protocol.disconnect();
                throw new ConnectionClosedError('AirPlay setup was interrupted.');
            }
        };

        try {
            await protocol.connect();
            assertCurrent();
            await protocol.fetchInfo();
            assertCurrent();

            if (this.#credentials) {
                this.#keys = await protocol.verify.start(this.#credentials);
            } else {
                await protocol.pairing.start();
                assertCurrent();
                this.#keys = await protocol.pairing.transient();
            }

            assertCurrent();
            await this.#setup();
            assertCurrent();
            if (!protocol.controlStream.isConnected || !protocol.dataStream?.isConnected || !protocol.eventStream?.isConnected) {
                throw new ConnectionClosedError('An AirPlay stream closed during setup.');
            }
            this.#ready = true;
        } catch (error) {
            if (this.#protocol === protocol) {
                this.disconnectSafely();
            }
            throw error;
        }

        this.emit('connected');
    }

    /**
     * Gracefully disconnects from the device, clears intervals, and tears down all streams.
     */
    disconnect(): void {
        this.#endSession(false);
    }

    #endSession(unexpected: boolean): void {
        if (this.#disconnect) {
            return;
        }

        this.#disconnect = true;
        this.#ready = false;
        for (const detach of this.#closeListeners.splice(0)) {
            detach();
        }
        this.#protocol?.controlStream.off('error', this.onError);
        this.#protocol?.controlStream.off('timeout', this.onTimeout);

        if (this.#feedbackInterval) {
            clearInterval(this.#feedbackInterval);
            this.#feedbackInterval = undefined;
        }

        this.#prevDataStream?.off('setConnectionState', this.onConnectionState);
        this.#prevDataStream?.off('error', this.onStreamError);
        this.#prevDataStream?.off('timeout', this.onTimeout);
        this.#prevEventStream?.off('error', this.onStreamError);
        this.#prevEventStream?.off('timeout', this.onTimeout);
        this.#prevDataStream = undefined;
        this.#prevEventStream = undefined;

        this.#cleanupPlayUrl();
        this.#cleanupStream();
        this.#unsubscribe();
        this.#artwork.clear();
        try {
            this.#protocol.disconnect();
        } finally {
            this.emit('disconnected', unexpected);
        }
    }

    /**
     * Disconnects gracefully, swallowing any errors during cleanup.
     */
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

        /* Use a separate URL-playback session, as pyatv does, to avoid interfering with remote control. */
        this.#playUrlProtocol?.disconnect();

        const playProtocol = new Protocol(this.#discoveryResult, this.#identity);

        if (this.#timingServer) {
            playProtocol.useTimingServer(this.#timingServer);
        }

        try {
            await playProtocol.connect();
            await playProtocol.fetchInfo();

            // PTP stays off: PtpMaster yields silent playback on PTP-capable
            // receivers, the NTP timing server does not.

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

    /**
     * Waits for the current URL playback to finish, then cleans up the play URL protocol.
     */
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

    /**
     * Stops the current URL playback and cleans up the dedicated play URL protocol.
     */
    stopPlayUrl(): void {
        this.#cleanupPlayUrl();
    }

    /**
     * Stops, disconnects, and discards the dedicated play URL protocol instance.
     */
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
     * @param volumeDb - Stream volume in dB (-144 = mute, 0 = max). A fresh
     *   audio session starts silent, so an audible default is applied.
     */
    async streamAudio(source: AudioSource, volumeDb: number = -20): Promise<void> {
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

            // PTP stays off: PtpMaster yields silent playback on PTP-capable
            // receivers, the NTP timing server does not.

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

            // A fresh AirPlay audio session starts silent.
            await streamProtocol.controlStream.setParameter('volume', String(volumeDb));

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

    /**
     * Stops the current audio stream and cleans up the dedicated stream protocol.
     */
    stopStreamAudio(): void {
        this.#cleanupStream();
    }

    /**
     * Stops, disconnects, and discards the dedicated audio stream protocol instance.
     */
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

    /** Requests assets for the captured item; a track change invalidates the result. */
    async requestContentItemAssets(options: Partial<DataStreamMessage.PlaybackQueueAssetOptions> = {}, width: number = 600, height: number = -1): Promise<Proto.ContentItem | null> {
        const player = this.#state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;

        if (!identifier) {
            return null;
        }

        // TVMusic returns sparse metadata for identifier-only requests; request the current queue window.
        const response = await this.#protocol.dataStream.exchange(DataStreamMessage.playbackQueueRequest(0, 1, width, height, {
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

    /**
     * Sends a periodic feedback request to keep the AirPlay session alive.
     */
    async #feedback(): Promise<void> {
        try {
            await this.#protocol.feedback();
        } catch (err) {
            this.#protocol.context.logger.error('Feedback error', err);
        }
    }

    /**
     * Handles an essential stream closing outside an intentional disconnect.
     */
    onClose(): void {
        this.#endSession(true);
    }

    #observeClose(stream: Protocol['controlStream'] | DataStream | EventStream, protocol: Protocol): void {
        if (stream !== protocol.controlStream && !stream.isConnected) throw new ConnectionClosedError();
        const onClose = (): void => {
            if (this.#protocol === protocol) {
                this.onClose();
            }
        };
        stream.on('close', onClose);
        this.#closeListeners.push(() => stream.off('close', onClose));
    }

    /**
     * Handles control stream error events by logging them.
     * Control stream errors are non-fatal by themselves; the 'close' event
     * that follows will trigger disconnect.
     */
    onError(err: Error): void {
        this.#protocol.context.logger.error('AirPlay error', err);
    }

    /**
     * Handles data/event stream error events by tearing down the connection.
     * These streams are critical for state tracking; if they fail, the device
     * is effectively unreachable and a full reconnect is needed.
     */
    onStreamError(err: Error): void {
        this.#protocol.context.logger.error('AirPlay stream error', err);
        this.#protocol.controlStream.destroy();
    }

    /**
     * Handles now-playing changes to auto-fetch artwork on track changes.
     */
    onNowPlayingChanged(_client: any, player: any): void {
        const artworkId = player?.artworkId ?? null;

        if (artworkId !== this.#lastArtworkId) {
            this.#lastArtworkId = artworkId;
            this.requestPlaybackQueue(1).catch(() => {
            });
        }
    }

    /**
     * Handles the connection state the Apple TV reports over the data stream. It answers a message
     * it rejects with Disconnected and then ignores the session, so the connection has to go down
     * with it instead of staying up in name only.
     *
     * @param message - The connection state the Apple TV reports.
     */
    onConnectionState(message: Proto.SetConnectionStateMessage): void {
        if (message.state !== Proto.SetConnectionStateMessage_ConnectionState.Disconnected) {
            return;
        }

        this.#protocol.context.logger.error('AirPlay session dropped by the device');
        this.#protocol.controlStream.destroy();
    }

    /**
     * Handles stream timeout events by destroying the control stream.
     */
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
        const protocol = this.#protocol;

        protocol.controlStream.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        this.#unsubscribe();

        if (this.#timingServer) {
            protocol.useTimingServer(this.#timingServer);
        }

        try {
            // Old subscriptions must be removed before binding the new streams.
            this.#prevDataStream?.off('error', this.onStreamError);
            this.#prevDataStream?.off('timeout', this.onTimeout);
            this.#prevDataStream?.off('setConnectionState', this.onConnectionState);
            this.#prevEventStream?.off('error', this.onStreamError);
            this.#prevEventStream?.off('timeout', this.onTimeout);

            await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
            if (this.#disconnect || protocol !== this.#protocol) {
                protocol.disconnect();
                throw new ConnectionClosedError();
            }
            this.#observeClose(protocol.eventStream, protocol);
            await protocol.setupDataStream(keys.sharedSecret, () => {
                if (!this.#disconnect && protocol === this.#protocol) this.#subscribe();
            });
            if (this.#disconnect || protocol !== this.#protocol) {
                protocol.disconnect();
                throw new ConnectionClosedError();
            }
            this.#observeClose(protocol.dataStream, protocol);

            protocol.dataStream.on('error', this.onStreamError);
            protocol.dataStream.on('timeout', this.onTimeout);
            protocol.dataStream.on('setConnectionState', this.onConnectionState);
            protocol.eventStream.on('error', this.onStreamError);
            protocol.eventStream.on('timeout', this.onTimeout);

            this.#prevDataStream = protocol.dataStream;
            this.#prevEventStream = protocol.eventStream;

            if (this.#feedbackInterval) {
                clearInterval(this.#feedbackInterval);
            }

            this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

            await protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId, protocol.context.identity));
            protocol.dataStream.send(DataStreamMessage.setConnectionState());
            protocol.dataStream.send(DataStreamMessage.clientUpdatesConfig(true, true, true, true));
            // The device answers with unidentified SET_STATE pushes, never with a reply to this identifier.
            protocol.dataStream.send(DataStreamMessage.getState());

            /* Fetch the playback queue when the artwork ID changes or artwork is missing. */
            this.#lastArtworkId = null;
            this.#state.on('nowPlayingChanged', this.onNowPlayingChanged);

            protocol.context.logger.info('Protocol ready.');
        } catch (err) {
            if (this.#feedbackInterval) {
                clearInterval(this.#feedbackInterval);
                this.#feedbackInterval = undefined;
            }

            protocol.context.logger.error('[device]', 'Setup failed, cleaning up', err);
            protocol.disconnect();

            throw err;
        }
    }

    /**
     * Subscribes the state tracker to DataStream events.
     */
    #subscribe(): void {
        this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    /**
     * Unsubscribes the state tracker from DataStream events.
     */
    #unsubscribe(): void {
        try {
            this.#state.off('nowPlayingChanged', this.onNowPlayingChanged);
            this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
        } catch (err) {
            this.#protocol.context.logger.error('State unsubscribe error', err);
        }
    }
}
