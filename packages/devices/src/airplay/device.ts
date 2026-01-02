import { EventEmitter } from 'node:events';
import { AirPlay, DataStreamMessage, Proto } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult, reporter, type TimingServer, waitFor } from '@basmilius/apple-common';
import { FEEDBACK_INTERVAL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Remote from './remote';
import State from './state';
import Volume from './volume';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default class extends EventEmitter<EventMap> {
    get [PROTOCOL](): AirPlay {
        return this.#protocol;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    get isConnected(): boolean {
        return this.#protocol?.rtsp?.isConnected ?? false;
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
    #protocol!: AirPlay;
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

        this.#protocol = new AirPlay(this.#discoveryResult);
        this.#protocol.rtsp.on('close', async () => this.#onClose());
        this.#protocol.rtsp.on('error', async (err: Error) => this.#onError(err));
        this.#protocol.rtsp.on('timeout', async () => this.#onTimeout());

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

        this.emit('disconnected', false);
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
        } catch (err) {
            reporter.error('Feedback error', err);
        }
    }

    async #onClose(): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        clearInterval(this.#feedbackInterval);

        this.emit('disconnected', true);
    }

    async #onError(err: Error): Promise<void> {
        reporter.error('AirPlay error', err);

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #onTimeout(): Promise<void> {
        reporter.error('AirPlay timeout');

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.rtsp.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#unsubscribe();

        if (this.#timingServer) {
            await this.#protocol.setupTimingServer(this.#timingServer);
        }

        await this.#protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
        await this.#protocol.setupDataStream(keys.sharedSecret, async () => await this.#subscribe());

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
            reporter.info('Device info received successfully, protocol should be ready.');
        }
    }

    async #subscribe(): Promise<void> {
        await this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    async #unsubscribe(): Promise<void> {
        try {
            await this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
        } catch (err) {
            reporter.error('State unsubscribe error', err);
        }
    }
}
