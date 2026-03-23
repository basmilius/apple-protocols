import { EventEmitter } from 'node:events';
import { type DataStream, DataStreamMessage, type EventStream, Proto, Protocol } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, type AudioSource, type DeviceIdentity, type DiscoveryResult, type TimingServer, waitFor } from '@basmilius/apple-common';
import { AirPlayFeature } from '@basmilius/apple-airplay';
import { FEEDBACK_INTERVAL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Remote from './remote';
import State from './state';
import Volume from './volume';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default class extends EventEmitter<EventMap> {
    get [PROTOCOL](): Protocol {
        return this.#protocol;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

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
            supportsAudio: has(AirPlayFeature.SupportsAirPlayAudio),
            supportsBufferedAudio: has(AirPlayFeature.SupportsBufferedAudio),
            supportsPTP: has(AirPlayFeature.SupportsPTP),
            supportsRFC2198Redundancy: has(AirPlayFeature.SupportsRFC2198Redundancy),
            supportsHangdogRemoteControl: has(AirPlayFeature.SupportsHangdogRemoteControl),
            supportsUnifiedMediaControl: has(AirPlayFeature.SupportsUnifiedMediaControl),
            supportsTransientPairing: has(AirPlayFeature.SupportsHKPairingAndAccessControl),
            supportsSystemPairing: has(AirPlayFeature.SupportsSystemPairing),
            supportsCoreUtilsPairing: has(AirPlayFeature.SupportsCoreUtilsPairingAndEncryption)
        };
    }

    get isConnected(): boolean {
        return this.#protocol?.controlStream?.isConnected ?? false;
    }

    get receiverInfo(): Record<string, any> | undefined {
        return this.#protocol?.receiverInfo;
    }

    get remote(): Remote {
        return this.#remote;
    }

    get state(): State {
        return this.#state;
    }

    get volume(): Volume {
        return this.#volume;
    }

    get timingServer(): TimingServer | undefined {
        return this.#timingServer;
    }

    set timingServer(timingServer: TimingServer | undefined) {
        this.#timingServer = timingServer;
    }

    readonly #boundOnClose = () => this.#onClose();
    readonly #boundOnError = (err: Error) => this.#onError(err);
    readonly #boundOnTimeout = () => this.#onTimeout();
    readonly #remote: Remote;
    readonly #state: State;
    readonly #volume: Volume;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #identity?: Partial<DeviceIdentity>;
    #feedbackInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;
    #playUrlProtocol?: Protocol;
    #prevDataStream?: DataStream;
    #prevEventStream?: EventStream;
    #protocol!: Protocol;
    #timingServer?: TimingServer;

    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#identity = identity;
        this.#remote = new Remote(this);
        this.#state = new State(this);
        this.#volume = new Volume(this);
    }

    async connect(): Promise<void> {
        // Clean up old protocol before creating a new one.
        // Prevents stale close events and resource leaks (open sockets, timers).
        if (this.#protocol) {
            this.#protocol.controlStream.off('close', this.#boundOnClose);
            this.#protocol.controlStream.off('error', this.#boundOnError);
            this.#protocol.controlStream.off('timeout', this.#boundOnTimeout);

            try {
                this.#protocol.disconnect();
            } catch {
                // Best-effort cleanup of old protocol.
            }
        }

        this.#disconnect = false;
        this.#state.clear();

        this.#protocol = new Protocol(this.#discoveryResult, this.#identity);
        this.#protocol.controlStream.on('close', this.#boundOnClose);
        this.#protocol.controlStream.on('error', this.#boundOnError);
        this.#protocol.controlStream.on('timeout', this.#boundOnTimeout);

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

    disconnect(): void {
        this.#disconnect = true;

        if (this.#feedbackInterval) {
            clearInterval(this.#feedbackInterval);
            this.#feedbackInterval = undefined;
        }

        this.#cleanupPlayUrl();
        this.#unsubscribe();
        this.#protocol.disconnect();
    }

    disconnectSafely(): void {
        try {
            this.disconnect();
        } catch (err) {
            this.#protocol?.context?.logger?.warn('[device]', 'Error during safe disconnect', err);
        }
    }

    async setConversationDetectionEnabled(enabled: boolean): Promise<void> {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (!outputDeviceUID) {
            throw new Error('No output device active.');
        }

        await this.#protocol.dataStream.send(DataStreamMessage.setConversationDetectionEnabled(enabled, outputDeviceUID));
    }

    async addOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext(deviceUIDs));
    }

    async removeOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext([], deviceUIDs));
    }

    async setOutputDevices(deviceUIDs: string[]): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.modifyOutputContext([], [], deviceUIDs));
    }

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
    }

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

    stopPlayUrl(): void {
        this.#cleanupPlayUrl();
    }

    #cleanupPlayUrl(): void {
        if (this.#playUrlProtocol) {
            this.#playUrlProtocol.stopPlayUrl();
            this.#playUrlProtocol.disconnect();
            this.#playUrlProtocol = undefined;
        }
    }

    async streamAudio(source: AudioSource): Promise<void> {
        await this.#protocol.setupAudioStream(source);
    }

    async requestPlaybackQueue(length: number): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.playbackQueueRequest(0, length));
    }

    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.sendCommand(command, options));
    }

    setCredentials(credentials: AccessoryCredentials): void {
        this.#credentials = credentials;
    }

    async #feedback(): Promise<void> {
        try {
            await this.#protocol.feedback();
        } catch (err) {
            this.#protocol.context.logger.error('Feedback error', err);
        }
    }

    #onClose(): void {
        this.#protocol.context.logger.net('#onClose() called on airplay device.');

        if (!this.#disconnect) {
            this.disconnectSafely();
            this.emit('disconnected', true);
        } else {
            this.emit('disconnected', false);
        }
    }

    #onError(err: Error): void {
        this.#protocol.context.logger.error('AirPlay error', err);
    }

    #onTimeout(): void {
        this.#protocol.context.logger.error('AirPlay timeout');
        this.#protocol.controlStream.destroy();
    }

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
            this.#prevDataStream?.off('error', this.#boundOnError);
            this.#prevDataStream?.off('timeout', this.#boundOnTimeout);
            this.#prevEventStream?.off('error', this.#boundOnError);
            this.#prevEventStream?.off('timeout', this.#boundOnTimeout);

            await this.#protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
            await this.#protocol.setupDataStream(keys.sharedSecret, () => this.#subscribe());

            this.#protocol.dataStream.on('error', this.#boundOnError);
            this.#protocol.dataStream.on('timeout', this.#boundOnTimeout);
            this.#protocol.eventStream.on('error', this.#boundOnError);
            this.#protocol.eventStream.on('timeout', this.#boundOnTimeout);

            this.#prevDataStream = this.#protocol.dataStream;
            this.#prevEventStream = this.#protocol.eventStream;

            if (this.#feedbackInterval) {
                clearInterval(this.#feedbackInterval);
            }

            this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

            await this.#protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId, this.#protocol.context.identity));
            await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState());
            await this.#protocol.dataStream.exchange(DataStreamMessage.clientUpdatesConfig(true, true, true, true, true, true));
            await this.#protocol.dataStream.exchange(DataStreamMessage.getState());

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

    #subscribe(): void {
        this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    #unsubscribe(): void {
        try {
            this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
        } catch (err) {
            this.#protocol.context.logger.error('State unsubscribe error', err);
        }
    }
}
