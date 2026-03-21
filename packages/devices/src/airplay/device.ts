import { EventEmitter } from 'node:events';
import { DataStreamMessage, Proto, Protocol } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, type AudioSource, type DiscoveryResult, type TimingServer, waitFor } from '@basmilius/apple-common';
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

    get isConnected(): boolean {
        return this.#protocol?.controlStream?.isConnected ?? false;
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

    readonly #remote: Remote;
    readonly #state: State;
    readonly #volume: Volume;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #feedbackInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;
    #protocol!: Protocol;
    #timingServer?: TimingServer;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#remote = new Remote(this);
        this.#state = new State(this);
        this.#volume = new Volume(this);
    }

    async connect(): Promise<void> {
        this.#disconnect = false;
        this.#state.clear();

        this.#protocol = new Protocol(this.#discoveryResult);
        this.#protocol.controlStream.on('close', this.#onClose.bind(this));
        this.#protocol.controlStream.on('error', this.#onError.bind(this));
        this.#protocol.controlStream.on('timeout', this.#onTimeout.bind(this));

        await this.#protocol.connect();

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

        this.#unsubscribe();
        this.#protocol.disconnect();
    }

    disconnectSafely(): void {
        try {
            this.disconnect();
        } catch (_) {
        }
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

        await this.#protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
        await this.#protocol.setupDataStream(keys.sharedSecret, () => this.#subscribe());

        this.#protocol.dataStream.on('error', this.#onError.bind(this));
        this.#protocol.dataStream.on('timeout', this.#onTimeout.bind(this));
        this.#protocol.eventStream.on('error', this.#onError.bind(this));
        this.#protocol.eventStream.on('timeout', this.#onTimeout.bind(this));

        this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

        try {
            await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState(Proto.SetConnectionStateMessage_ConnectionState.Connecting));
            await waitFor(500);

            const gid = this.#discoveryResult.txt.gid;

            if (gid) {
                await this.#protocol.dataStream.exchange(DataStreamMessage.configureConnection(gid));
            }

            const result = await Promise.race([
                new Promise(async resolve => {
                    this.#protocol.dataStream.once('deviceInfo', async () => {
                        await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState());
                        await this.#protocol.dataStream.exchange(DataStreamMessage.clientUpdatesConfig());
                        resolve(true);
                    });

                    await this.#protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId));
                }),
                async () => {
                    await waitFor(3000);
                    return false;
                }
            ]);

            if (!result) {
                this.#onError(new Error('Device did not respond in time with its info.'));
            } else {
                this.#protocol.context.logger.info('Device info received successfully, protocol should be ready.');
            }
        } catch (err) {
            clearInterval(this.#feedbackInterval);
            this.#feedbackInterval = undefined;

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
