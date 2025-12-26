import { EventEmitter } from 'node:events';
import { CompanionLink, type CompanionLinkApi } from '@basmilius/apple-companion-link';
import { type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult, reporter } from '@basmilius/apple-common';
import { PROTOCOL } from './const';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    power: [boolean];
};

type CLAPI = typeof CompanionLinkApi.prototype;

export type ButtonPressType = Parameters<CLAPI['pressButton']>[1];
export type HidCommand = Parameters<CLAPI['pressButton']>[0];
export type MediaControlCommand = Parameters<CLAPI['mediaControlCommand']>[0];

export default class extends EventEmitter<EventMap> {
    get [PROTOCOL](): CompanionLink {
        return this.#protocol;
    }

    get isConnected(): boolean {
        return this.#protocol?.socket?.isConnected ?? false;
    }

    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #keys: AccessoryKeys;
    #protocol!: CompanionLink;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;

        this.onSystemStatus = this.onSystemStatus.bind(this);
        this.onTVSystemStatus = this.onTVSystemStatus.bind(this);
    }

    async connect(): Promise<void> {
        if (!this.#credentials) {
            throw new Error('Credentials are required to connect to a Companion Link device.');
        }

        this.#disconnect = false;
        this.#protocol = new CompanionLink(this.#discoveryResult);
        this.#protocol.socket.on('close', async () => this.#onClose());
        this.#protocol.socket.on('error', async (err: Error) => this.#onError(err));

        await this.#protocol.connect();
        this.#keys = await this.#protocol.verify.start(this.#credentials);

        await this.#setup();

        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.#disconnect = true;

        await this.#unsubscribe();
        await this.#protocol.disconnect();

        this.emit('disconnected', false);
    }

    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    async setDiscoveryResult(discoveryResult: DiscoveryResult): Promise<void> {
        this.#discoveryResult = discoveryResult;
    }

    async getAttentionState(): ReturnType<CLAPI['getAttentionState']> {
        return await this.#protocol.api.getAttentionState();
    }

    async getLaunchableApps(): ReturnType<CLAPI['getLaunchableApps']> {
        return await this.#protocol.api.getLaunchableApps();
    }

    async getUserAccounts(): ReturnType<CLAPI['getUserAccounts']> {
        return await this.#protocol.api.getUserAccounts();
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#protocol.api.launchApp(bundleId);
    }

    async launchUrl(url: string): Promise<void> {
        await this.#protocol.api.launchUrl(url);
    }

    async mediaControlCommand(command: MediaControlCommand, content?: object): Promise<void> {
        await this.#protocol.api.mediaControlCommand(command, content);
    }

    async pressButton(command: HidCommand, type?: ButtonPressType, holdDelayMs?: number): Promise<void> {
        await this.#protocol.api.pressButton(command, type, holdDelayMs);
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#protocol.api.switchUserAccount(accountId);
    }

    async #onClose(): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        this.emit('disconnected', true);
    }

    async #onError(err: Error): Promise<void> {
        reporter.error('Companion Link error', err);

        try {
            await this.disconnect();
        } catch (_) {
        }

        this.emit('disconnected', true);
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.socket.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#protocol.api._systemInfo(this.#credentials.pairingId);
        await this.#protocol.api._touchStart();
        await this.#protocol.api._sessionStart();
        await this.#protocol.api._tvrcSessionStart();
        await this.#protocol.api._unsubscribe('_iMC');

        await this.#subscribe();
    }

    async #subscribe(): Promise<void> {
        await this.#protocol.api._subscribe('SystemStatus', this.onSystemStatus);
        await this.#protocol.api._subscribe('TVSystemStatus', this.onTVSystemStatus);

        const state = await this.getAttentionState();
        this.emit('power', state === 'awake' || state === 'screensaver');
    }

    async #unsubscribe(): Promise<void> {
        await this.#protocol.api._unsubscribe('SystemStatus', this.onSystemStatus);
        await this.#protocol.api._unsubscribe('TVSystemStatus', this.onTVSystemStatus);
    }

    async onSystemStatus(data: { readonly state: number; }): Promise<void> {
        reporter.info('System Status', data);
        this.emit('power', data.state === 0x02 || data.state === 0x03);
    }

    async onTVSystemStatus(data: { readonly state: number; }): Promise<void> {
        reporter.info('TV System Status', data);
        this.emit('power', data.state === 0x02 || data.state === 0x03);
    }
}
