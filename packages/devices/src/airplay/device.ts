import { EventEmitter } from 'node:events';
import { AirPlay, type AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import { type AccessoryKeys, debug, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { AIRPLAY_FEEDBACK_INTERVAL, AIRPLAY_PROTOCOL, AIRPLAY_STATE_SUBSCRIBE_SYMBOL, AIRPLAY_STATE_UNSUBSCRIBE_SYMBOL } from './const';
import State from './state';

type EventMap = {
    connected: [];
    disconnected: [];
};

export default class extends EventEmitter<EventMap> {
    get [AIRPLAY_PROTOCOL](): AirPlay {
        return this.#protocol;
    }

    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
    }

    get state(): State {
        return this.#state;
    }

    readonly #discoveryResult: DiscoveryResult;
    readonly #state: State;
    #disconnect: boolean = false;
    #feedbackInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;
    #protocol!: AirPlay;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;
        this.#state = new State(this);
    }

    async connect(): Promise<void> {
        this.#disconnect = false;

        this.#protocol = new AirPlay(this.#discoveryResult);

        await this.#protocol.connect();
        await this.#protocol.pairing.start();
        this.#keys = await this.#protocol.pairing.transient();

        this.#protocol.rtsp.on('close', async () => this.#onClose());

        await this.#setup();

        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.#disconnect = true;

        clearInterval(this.#feedbackInterval);

        await this.#unsubscribe();
        await this.#protocol.disconnect();

        this.emit('disconnected');
    }

    async sendButtonEvent(usagePage: number, usage: number, buttonDown: boolean): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.sendButtonEvent(usagePage, usage, buttonDown));
    }

    async sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.sendCommand(command, options));
    }

    async setVolume(volume: number): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.setVolume(volume));
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

        clearInterval(this.#feedbackInterval);

        await this.#unsubscribe();
        await waitFor(10000);
        await this.connect();
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.rtsp.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
        await this.#protocol.setupDataStream(keys.sharedSecret);

        this.#feedbackInterval = setInterval(async () => await this.#feedback(), AIRPLAY_FEEDBACK_INTERVAL);

        await this.#dataStream.exchange(this.#dataStream.messages.deviceInfo(keys.pairingId));

        this.#dataStream.on('deviceInfo', async () => {
            await this.#subscribe();
            await this.#dataStream.exchange(this.#dataStream.messages.setConnectionState());
            await this.#dataStream.exchange(this.#dataStream.messages.clientUpdatesConfig());
        });
    }

    async #subscribe(): Promise<void> {
        await this.#state[AIRPLAY_STATE_SUBSCRIBE_SYMBOL]();
    }

    async #unsubscribe(): Promise<void> {
        await this.#state[AIRPLAY_STATE_UNSUBSCRIBE_SYMBOL]();
    }
}
