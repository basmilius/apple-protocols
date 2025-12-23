import { EventEmitter } from 'node:events';
import { AirPlay, type AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import { type AccessoryCredentials, type AccessoryKeys, debug, type DiscoveryResult } from '@basmilius/apple-common';
import { FEEDBACK_INTERVAL, PROTOCOL, STATE_SUBSCRIBE_SYMBOL, STATE_UNSUBSCRIBE_SYMBOL } from './const';
import Remote from './remote';
import State from './state';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
};

export default class extends EventEmitter<EventMap> {
    get [PROTOCOL](): AirPlay {
        return this.#protocol;
    }

    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
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

    readonly #remote: Remote;
    readonly #state: State;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #feedbackInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;
    #protocol!: AirPlay;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#remote = new Remote(this);
        this.#state = new State(this);
    }

    async connect(): Promise<void> {
        this.#disconnect = false;
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
        await this.#dataStream.exchange(this.#dataStream.messages.playbackQueueRequest(0, length));
    }

    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.sendCommand(command, options));
    }

    async setVolume(volume: number): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.setVolume(volume));
    }

    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    async setDiscoveryResult(discoveryResult: DiscoveryResult): Promise<void> {
        this.#discoveryResult = discoveryResult;
    }

    async #feedback(): Promise<void> {
        try {
            await this.#protocol.feedback();
        } catch (err) {
            debug('Feedback error', err);
        }
    }

    async #onClose(): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        this.emit('disconnected', true);
    }

    async #onError(err: Error): Promise<void> {
        debug('AirPlay error', err);

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #onTimeout(): Promise<void> {
        debug('AirPlay timeout');

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.rtsp.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
        await this.#protocol.setupDataStream(keys.sharedSecret);
        await this.#subscribe();

        this.#feedbackInterval = setInterval(async () => await this.#feedback(), FEEDBACK_INTERVAL);

        const gid = this.#discoveryResult.packet.additionals.find(a => 'rdata' in a && typeof a['rdata'] === 'object' && 'gid' in a['rdata'])?.['rdata']['gid'] as string;

        if (gid) {
            await this.#dataStream.exchange(this.#dataStream.messages.configureConnection(gid));
        }

        await this.#dataStream.exchange(this.#dataStream.messages.deviceInfo(keys.pairingId));

        this.#dataStream.on('deviceInfo', async () => {
            await this.#dataStream.exchange(this.#dataStream.messages.setConnectionState());
            await this.#dataStream.exchange(this.#dataStream.messages.clientUpdatesConfig());
        });
    }

    async #subscribe(): Promise<void> {
        await this.#state[STATE_SUBSCRIBE_SYMBOL]();
    }

    async #unsubscribe(): Promise<void> {
        await this.#state[STATE_UNSUBSCRIBE_SYMBOL]();
    }
}
