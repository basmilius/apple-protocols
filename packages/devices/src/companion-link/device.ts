import { EventEmitter } from 'node:events';
import { CredentialsError, type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { type AttentionState, type ButtonPressType, type HidCommandKey, type LaunchableApp, type MediaControlCommandKey, Protocol, type TextInputState, type UserAccount } from '@basmilius/apple-companion-link';
import { PROTOCOL } from './const';
import CompanionLinkState, { type MediaCapabilities } from './state';

type EventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    attentionStateChanged: [AttentionState];
    mediaControlFlagsChanged: [flags: number, capabilities: MediaCapabilities];
    nowPlayingInfoChanged: [info: Record<string, unknown> | null];
    supportedActionsChanged: [actions: Record<string, unknown>];
    textInputChanged: [TextInputState];
    volumeAvailabilityChanged: [available: boolean];
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

    get state(): CompanionLinkState {
        return this.#state;
    }

    get textInputState(): TextInputState {
        return this.#state.textInputState;
    }

    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #heartbeatInterval: NodeJS.Timeout | undefined;
    #keys: AccessoryKeys;
    #protocol!: Protocol;
    #state!: CompanionLinkState;

    constructor(discoveryResult: DiscoveryResult) {
        super();
        this.#discoveryResult = discoveryResult;

        this.onClose = this.onClose.bind(this);
        this.onError = this.onError.bind(this);
        this.onTimeout = this.onTimeout.bind(this);
    }

    // --- Lifecycle ---

    async connect(): Promise<void> {
        if (!this.#credentials) {
            throw new CredentialsError('Credentials are required to connect to a Companion Link device.');
        }

        if (this.#protocol) {
            this.#protocol.stream.off('close', this.onClose);
            this.#protocol.stream.off('error', this.onError);
            this.#protocol.stream.off('timeout', this.onTimeout);
        }

        this.#disconnect = false;
        this.#protocol = new Protocol(this.#discoveryResult);
        this.#protocol.stream.on('close', this.onClose);
        this.#protocol.stream.on('error', this.onError);
        this.#protocol.stream.on('timeout', this.onTimeout);

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

        this.#state?.unsubscribe();
        await this.#protocol.disconnect();
    }

    async disconnectSafely(): Promise<void> {
        try {
            await this.disconnect();
        } catch {}
    }

    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    // --- Fetchers ---

    async getAttentionState(): Promise<AttentionState> {
        return await this.#protocol.getAttentionState();
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#protocol.getLaunchableApps();
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#protocol.getUserAccounts();
    }

    async fetchNowPlayingInfo(): Promise<any> {
        return await this.#protocol.fetchNowPlayingInfo();
    }

    async fetchSupportedActions(): Promise<any> {
        return await this.#protocol.fetchSupportedActions();
    }

    async fetchMediaControlStatus(): Promise<any> {
        return await this.#protocol.fetchMediaControlStatus();
    }

    // --- Commands ---

    async launchApp(bundleId: string): Promise<void> {
        await this.#protocol.launchApp(bundleId);
    }

    async launchUrl(url: string): Promise<void> {
        await this.#protocol.launchUrl(url);
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<void> {
        await this.#protocol.mediaControlCommand(command, content);
    }

    async pressButton(command: HidCommandKey, type?: ButtonPressType, holdDelayMs?: number): Promise<void> {
        await this.#protocol.pressButton(command, type, holdDelayMs);
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#protocol.switchUserAccount(accountId);
    }

    // --- Text Input ---

    async textSet(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, true);
    }

    async textAppend(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, false);
    }

    async textClear(): Promise<void> {
        await this.#protocol.textInputCommand('', true);
    }

    // --- Touch ---

    async sendTouchEvent(finger: number, phase: number, x: number, y: number): Promise<void> {
        await this.#protocol.sendTouchEvent(finger, phase, x, y);
    }

    async tap(x: number = 500, y: number = 500): Promise<void> {
        await this.sendTouchEvent(0, 0, x, y);
        await waitFor(50);
        await this.sendTouchEvent(0, 2, x, y);
    }

    async swipe(direction: 'up' | 'down' | 'left' | 'right', duration: number = 200): Promise<void> {
        const coords: Record<string, [number, number, number, number]> = {
            up: [500, 700, 500, 300],
            down: [500, 300, 500, 700],
            left: [700, 500, 300, 500],
            right: [300, 500, 700, 500]
        };

        const [startX, startY, endX, endY] = coords[direction];
        const steps = Math.max(4, Math.floor(duration / 50));
        const deltaX = (endX - startX) / steps;
        const deltaY = (endY - startY) / steps;
        const stepDuration = duration / steps;

        await this.sendTouchEvent(0, 0, startX, startY);

        for (let i = 1; i < steps; i++) {
            await waitFor(stepDuration);
            await this.sendTouchEvent(0, 1, Math.round(startX + deltaX * i), Math.round(startY + deltaY * i));
        }

        await waitFor(stepDuration);
        await this.sendTouchEvent(0, 2, endX, endY);
    }

    // --- System Controls ---

    async toggleCaptions(): Promise<void> {
        await this.#protocol.toggleCaptions();
    }

    async toggleSystemAppearance(light: boolean): Promise<void> {
        await this.#protocol.toggleSystemAppearance(light);
    }

    async toggleReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#protocol.toggleReduceLoudSounds(enabled);
    }

    async toggleFindingMode(enabled: boolean): Promise<void> {
        await this.#protocol.toggleFindingMode(enabled);
    }

    // --- Up Next ---

    async fetchUpNext(paginationToken?: string): Promise<any> {
        return await this.#protocol.fetchUpNext(paginationToken);
    }

    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#protocol.addToUpNext(identifier, kind);
    }

    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#protocol.removeFromUpNext(identifier, kind);
    }

    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#protocol.markAsWatched(identifier, kind);
    }

    // --- Siri ---

    async siriStart(): Promise<void> {
        await this.#protocol.siriStart();
    }

    async siriStop(): Promise<void> {
        await this.#protocol.siriStop();
    }

    // --- Internals ---

    async #setup(): Promise<void> {
        const keys = this.#keys;

        this.#protocol.stream.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        try {
            await this.#protocol.systemInfo(this.#credentials!.pairingId);
            await this.#protocol.sessionStart();
            await this.#protocol.tvrcSessionStart();
            await this.#protocol.touchStart();
            await this.#protocol.tiStart();

            this.#heartbeatInterval = setInterval(() => {
                try {
                    this.#protocol.noOp();
                } catch (err) {
                    this.#protocol.context.logger.error('Heartbeat failed', err);
                }
            }, 15000);

            // Create state and wire up event forwarding.
            this.#state = new CompanionLinkState(this.#protocol);
            this.#state.on('attentionStateChanged', (s) => this.emit('attentionStateChanged', s));
            this.#state.on('mediaControlFlagsChanged', (f, c) => this.emit('mediaControlFlagsChanged', f, c));
            this.#state.on('nowPlayingInfoChanged', (i) => this.emit('nowPlayingInfoChanged', i));
            this.#state.on('supportedActionsChanged', (a) => this.emit('supportedActionsChanged', a));
            this.#state.on('textInputChanged', (s) => this.emit('textInputChanged', s));
            this.#state.on('volumeAvailabilityChanged', (a) => this.emit('volumeAvailabilityChanged', a));
            this.#state.subscribe();
            await this.#state.fetchInitialState();
        } catch (err) {
            clearInterval(this.#heartbeatInterval);
            this.#heartbeatInterval = undefined;
            throw err;
        }
    }

    onClose(): void {
        this.#protocol.context.logger.net('onClose() called on companion link device.');

        if (!this.#disconnect) {
            this.disconnectSafely();
            this.emit('disconnected', true);
        } else {
            this.emit('disconnected', false);
        }
    }

    onError(err: Error): void {
        this.#protocol.context.logger.error('Companion Link error', err);
    }

    onTimeout(): void {
        this.#protocol.context.logger.error('Companion Link timeout');
        this.#protocol.stream.destroy();
    }
}
