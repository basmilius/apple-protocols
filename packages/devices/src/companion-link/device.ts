import { EventEmitter } from 'node:events';
import { CredentialsError, type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult } from '@basmilius/apple-common';
import { type AttentionState, type ButtonPressType, convertAttentionState, type HidCommandKey, type LaunchableApp, type MediaControlCommandKey, Protocol, type TextInputState, type UserAccount } from '@basmilius/apple-companion-link';
import { Plist } from '@basmilius/apple-encoding';
import { PROTOCOL } from './const';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    power: [AttentionState];
    textInput: [TextInputState];
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
        return this.#protocol?.stream?.isConnected ?? false;
    }

    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #heartbeatInterval: NodeJS.Timeout;
    #keys: AccessoryKeys;
    #protocol!: Protocol;

    get textInputState(): TextInputState {
        return this.#textInputState;
    }

    #textInputState: TextInputState = {isActive: false, documentText: '', isSecure: false, keyboardType: 0, autocorrection: false, autocapitalization: false};

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;

        this.onSystemStatus = this.onSystemStatus.bind(this);
        this.onTVSystemStatus = this.onTVSystemStatus.bind(this);
    }

    async connect(): Promise<void> {
        if (!this.#credentials) {
            throw new CredentialsError('Credentials are required to connect to a Companion Link device.');
        }

        this.#disconnect = false;
        this.#protocol = new Protocol(this.#discoveryResult);
        this.#protocol.stream.on('close', async () => this.#onClose());
        this.#protocol.stream.on('error', async (err: Error) => this.#onError(err));
        this.#protocol.stream.on('timeout', async () => this.#onTimeout());

        await this.#protocol.connect();
        this.#keys = await this.#protocol.verify.start(this.#credentials);

        await this.#setup();

        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.#disconnect = true;

        if (this.#heartbeatInterval) {
            clearInterval(this.#heartbeatInterval);
            this.#heartbeatInterval = undefined;
        }

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

    async textSet(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, true);
    }

    async textAppend(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, false);
    }

    async textClear(): Promise<void> {
        await this.#protocol.textInputCommand('', true);
    }

    async #heartbeat(): Promise<void> {
        try {
            this.#protocol.noOp();
        } catch (err) {
            this.#protocol.context.logger.error('Heartbeat error', err);
        }
    }

    async #onClose(): Promise<void> {
        this.#protocol.context.logger.net('#onClose() called on companion link device.');

        if (!this.#disconnect) {
            await this.disconnectSafely();
            this.emit('disconnected', true);
        } else {
            this.emit('disconnected', false);
        }
    }

    async #onError(err: Error): Promise<void> {
        this.#protocol.context.logger.error('Companion Link error', err);
    }

    async #onTimeout(): Promise<void> {
        this.#protocol.context.logger.error('Companion Link timeout');

        await this.#protocol.stream.destroy();
    }

    async #setup(): Promise<void> {
        const keys = this.#keys;

        this.#protocol.stream.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        try {
            await this.#protocol.systemInfo(this.#credentials.pairingId);
            await this.#protocol.sessionStart();
            await this.#protocol.tvrcSessionStart();
            await this.#protocol.touchStart();
            await this.#protocol.tiStart();

            this.#heartbeatInterval = setInterval(async () => await this.#heartbeat(), 15000);

            await this.#subscribe();
        } catch (err) {
            clearInterval(this.#heartbeatInterval);
            this.#heartbeatInterval = undefined;

            throw err;
        }
    }

    async #subscribe(): Promise<void> {
        // Register listeners on the stream directly.
        this.#protocol.stream.on('_iMC', (data: unknown) => {
            this.emit('mediaControl' as any, data);
        });
        this.#protocol.stream.on('SystemStatus', this.onSystemStatus);
        this.#protocol.stream.on('TVSystemStatus', this.onTVSystemStatus);
        this.#protocol.stream.on('_tiStarted', this.#onTextInputStarted);
        this.#protocol.stream.on('_tiStopped', this.#onTextInputStopped);

        // Send all interests in a single message (like bunatv).
        this.#protocol.registerInterests(['_iMC', 'SystemStatus', 'TVSystemStatus']);

        const state = await this.getAttentionState();
        this.emit('power', state);
    }

    async #unsubscribe(): Promise<void> {
        this.#protocol.stream.off('SystemStatus', this.onSystemStatus);
        this.#protocol.stream.off('TVSystemStatus', this.onTVSystemStatus);
        this.#protocol.stream.off('_tiStarted', this.#onTextInputStarted);
        this.#protocol.stream.off('_tiStopped', this.#onTextInputStopped);

        try {
            this.#protocol.deregisterInterests(['_iMC', 'SystemStatus', 'TVSystemStatus']);
        } catch (_) {
        }
    }

    #onTextInputStarted = async (data: unknown): Promise<void> => {
        try {
            const payload = data as { readonly _tiV?: number; readonly _tiD?: Uint8Array };
            let documentText = '';
            let isSecure = false;
            let keyboardType = 0;
            let autocorrection = false;
            let autocapitalization = false;

            if (payload?._tiD) {
                const plistData = Plist.parse(Buffer.from(payload._tiD).buffer as ArrayBuffer) as Record<string, unknown>;
                documentText = (plistData._tiDT as string) ?? '';
                isSecure = (plistData._tiSR as boolean) ?? false;
                keyboardType = (plistData._tiKT as number) ?? 0;
                autocorrection = (plistData._tiAC as boolean) ?? false;
                autocapitalization = (plistData._tiAP as boolean) ?? false;
            }

            this.#textInputState = {isActive: true, documentText, isSecure, keyboardType, autocorrection, autocapitalization};
            this.emit('textInput', this.#textInputState);
        } catch (err) {
            this.#protocol.context.logger.error('Text input started parse error', err);
        }
    }

    #onTextInputStopped = async (_data: unknown): Promise<void> => {
        this.#textInputState = {isActive: false, documentText: '', isSecure: false, keyboardType: 0, autocorrection: false, autocapitalization: false};
        this.emit('textInput', this.#textInputState);
    };

    async onSystemStatus(data: { readonly state: number; }): Promise<void> {
        this.#protocol.context.logger.info('System Status', data);
        this.emit('power', convertAttentionState(data.state));
    }

    async onTVSystemStatus(data: { readonly state: number; }): Promise<void> {
        this.#protocol.context.logger.info('TV System Status', data);
        this.emit('power', convertAttentionState(data.state));
    }
}
