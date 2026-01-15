import { EventEmitter } from 'node:events';
import type { AccessoryCredentials, AccessoryKeys, DiscoveryResult } from '@basmilius/apple-common';
import { reporter } from '@basmilius/apple-common';
import type { AttentionState, ButtonPressType, HidCommandKey, LaunchableApp, MediaControlCommandKey, UserAccount } from '@basmilius/apple-companion-link';
import { CompanionLink, convertAttentionState } from '@basmilius/apple-companion-link';
import { PROTOCOL } from './const';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    power: [AttentionState];
};

export default class extends EventEmitter<EventMap> {
    get [PROTOCOL](): CompanionLink {
        return this.#protocol;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    get isConnected(): boolean {
        return this.#protocol?.socket?.isConnected ?? false;
    }

    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #heartbeatInterval: NodeJS.Timeout;
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
        this.#protocol.socket.on('timeout', async () => this.#onTimeout());

        await this.#protocol.connect();
        this.#keys = await this.#protocol.verify.start(this.#credentials);

        await this.#setup();

        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.#disconnect = true;

        clearInterval(this.#heartbeatInterval);

        await this.#unsubscribe();
        await this.#protocol.disconnect();
    }

    async disconnectSafely(): Promise<void> {
        try {
            await this.disconnect();
        } catch (_) {
        }
    }

    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    async getAttentionState(): Promise<AttentionState> {
        return await this.#protocol.getAttentionState();
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#protocol.getLaunchableApps();
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#protocol.getUserAccounts();
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#protocol.launchApp(bundleId);
    }

    async launchUrl(url: string): Promise<void> {
        await this.#protocol.launchUrl(url);
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: object): Promise<void> {
        await this.#protocol.mediaControlCommand(command, content);
    }

    async pressButton(command: HidCommandKey, type?: ButtonPressType, holdDelayMs?: number): Promise<void> {
        await this.#protocol.pressButton(command, type, holdDelayMs);
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#protocol.switchUserAccount(accountId);
    }

    async #heartbeat(): Promise<void> {
        try {
            await this.#protocol._systemInfo(this.#credentials.pairingId);
        } catch (err) {
            reporter.error('Heartbeat error', err);
        }
    }

    async #onClose(): Promise<void> {
        if (this.#disconnect) {
            return;
        }

        clearInterval(this.#heartbeatInterval);

        this.emit('disconnected', false);
    }

    async #onError(err: Error): Promise<void> {
        reporter.error('Companion Link error', err);

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #onTimeout(): Promise<void> {
        reporter.error('Companion Link timeout');

        await this.disconnectSafely();

        this.emit('disconnected', true);
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        await this.#protocol.socket.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        await this.#protocol._systemInfo(this.#credentials.pairingId);
        await this.#protocol._touchStart();
        await this.#protocol._sessionStart();
        await this.#protocol._tvrcSessionStart();
        await this.#protocol._unsubscribe('_iMC');

        this.#heartbeatInterval = setInterval(async () => await this.#heartbeat(), 15000);

        await this.#subscribe();
    }

    async #subscribe(): Promise<void> {
        await this.#protocol._subscribe('SystemStatus', this.onSystemStatus);
        await this.#protocol._subscribe('TVSystemStatus', this.onTVSystemStatus);

        const state = await this.getAttentionState();
        this.emit('power', state);
    }

    async #unsubscribe(): Promise<void> {
        try {
            await this.#protocol._unsubscribe('SystemStatus', this.onSystemStatus);
            await this.#protocol._unsubscribe('TVSystemStatus', this.onTVSystemStatus);
        } catch (_) {
        }
    }

    async onSystemStatus(data: { readonly state: number; }): Promise<void> {
        reporter.info('System Status', data);
        this.emit('power', convertAttentionState(data.state));
    }

    async onTVSystemStatus(data: { readonly state: number; }): Promise<void> {
        reporter.info('TV System Status', data);
        this.emit('power', convertAttentionState(data.state));
    }
}
