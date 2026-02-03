import { EventEmitter } from 'node:events';
import { DataStreamMessage, Proto, Protocol } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult, type TimingServer, waitFor } from '@basmilius/apple-common';
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
        this.#protocol.controlStream.on('close', async () => this.#onClose());
        this.#protocol.controlStream.on('error', async (err: Error) => this.#onError(err));
        this.#protocol.controlStream.on('timeout', async () => this.#onTimeout());

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

    async disconnect(): Promise<void> {
        this.#disconnect = true;

        clearInterval(this.#feedbackInterval);

        await this.#unsubscribe();
        await this.#protocol.disconnect();
    }

    async disconnectSafely(): Promise<void> {
        try {
            await this.disconnect();
        } catch (_) {
        }
    }

    async requestPlaybackQueue(length: number): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.playbackQueueRequest(0, length));
    }

    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.sendCommand(command, options));
    }

    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    async #feedback(): Promise<void> {
        try {
            await this.#protocol.feedback();
            await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState(Proto.SetConnectionStateMessage_ConnectionState.Connected));
        } catch (err) {
            this.#protocol.context.logger.error('Feedback error', err);
        }
    }

    async #onClose(): Promise<void> {
        this.#protocol.context.logger.net('#onClose() called on airplay device.');

        if (!this.#disconnect) {
            await this.disconnectSafely();
            this.emit('disconnected', true);
        } else {
            this.emit('disconnected', false);
        }
    }

    async #onError(err: Error): Promise<void> {
        this.#protocol.context.logger.error('AirPlay error', err);
    }

    async #onTimeout(): Promise<void> {
        this.#protocol.context.logger.error('AirPlay timeout');

        await this.#protocol.controlStream.destroy();
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

        this.#protocol.dataStream.on('error', async (err: Error) => this.#onError(err));
        this.#protocol.dataStream.on('timeout', async () => this.#onTimeout());
        this.#protocol.eventStream.on('error', async (err: Error) => this.#onError(err));
        this.#protocol.eventStream.on('timeout', async () => this.#onTimeout());

        this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

        await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState(Proto.SetConnectionStateMessage_ConnectionState.Connecting));
        await waitFor(500);

        const gid = this.#discoveryResult.packet.additionals.find(a => 'rdata' in a && typeof a['rdata'] === 'object' && 'gid' in a['rdata'])?.['rdata']['gid'] as string;

        if (gid) {
            await this.#protocol.dataStream.exchange(DataStreamMessage.configureConnection(gid));
        }

        await this.#protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId));

        const result = await Promise.race([
            new Promise(resolve => {
                this.#protocol.dataStream.on('deviceInfo', async () => {
                    await this.#protocol.dataStream.exchange(DataStreamMessage.setConnectionState());
                    await this.#protocol.dataStream.exchange(DataStreamMessage.clientUpdatesConfig());
                    resolve(true);
                });
            }),
            async () => {
                await waitFor(3000);
                return false;
            }
        ]);

        if (!result) {
            await this.#onError(new Error('Device did not respond in time with its info.'));
        } else {
            this.#protocol.context.logger.info('Device info received successfully, protocol should be ready.');
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
