import { EventEmitter } from 'node:events';
import { AirPlay, type AirPlayDataStream, Proto } from '@basmilius/apple-airplay';
import type { AccessoryKeys, DiscoveryResult } from '@basmilius/apple-common';
import { AIRPLAY_FEEDBACK_INTERVAL, AIRPLAY_PROTOCOL, AIRPLAY_STATE_SUBSCRIBE_SYMBOL, AIRPLAY_STATE_UNSUBSCRIBE_SYMBOL } from './const';
import State from './state';

export default class extends EventEmitter {
    get [AIRPLAY_PROTOCOL](): AirPlay {
        return this.#protocol;
    }

    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
    }

    get state(): State {
        return this.#state;
    }

    readonly #protocol: AirPlay;
    readonly #state: State;
    #feedbackInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#protocol = new AirPlay(discoveryResult);
        this.#state = new State(this);
    }

    async connect(): Promise<void> {
        await this.#protocol.connect();

        await this.#protocol.pairing.start();
        this.#keys = await this.#protocol.pairing.transient();

        await this.#setup();
    }

    async disconnect(): Promise<void> {
        clearInterval(this.#feedbackInterval);

        await this.#unsubscribe();
        await this.#protocol.disconnect();
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

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.rtsp.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
        await this.#protocol.setupDataStream(keys.sharedSecret);

        this.#feedbackInterval = setInterval(() => this.#protocol.feedback(), AIRPLAY_FEEDBACK_INTERVAL);

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
