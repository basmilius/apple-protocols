import { randomInt } from 'node:crypto';
import { Context, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { HidCommand, type HidCommandKey, MediaControlCommand, type MediaControlCommandKey } from './const';
import { FrameType } from './frame';
import * as Message from './messages';
import { Pairing, Verify } from './pairing';
import type { AttentionState, ButtonPressType, LaunchableApp, UserAccount } from './types';
import { convertAttentionState } from './utils';
import Stream from './stream';

export default class Protocol {
    get context(): Context {
        return this.#context;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get stream(): Stream {
        return this.#stream;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #context: Context;
    readonly #discoveryResult: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #stream: Stream;
    readonly #verify: Verify;
    #sessionId: bigint = 0n;
    #sessionIdLocal: number = 0;
    #sourceVersion: number = 0;

    constructor(discoveryResult: DiscoveryResult) {
        this.#context = new Context(discoveryResult.id);
        this.#discoveryResult = discoveryResult;
        this.#stream = new Stream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    // --- Lifecycle ---

    async connect(): Promise<void> {
        await this.#stream.connect();
    }

    destroy(): void {
        this.#stream.destroy();
    }

    async disconnect(): Promise<void> {
        try {
            await this.gracefulStop();
        } catch (err) {
            this.#context.logger.warn('[companion-link]', 'Graceful stop failed during disconnect', err);
        }

        await this.#stream.disconnect();
    }

    async gracefulStop(): Promise<void> {
        if (!this.#stream.isConnected) {
            return;
        }

        this.deregisterInterests(['_iMC', 'SystemStatus', 'TVSystemStatus']);

        try { await this.tiStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'tiStop failed', err);
        }
        try { await this.touchStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'touchStop failed', err);
        }
        try { await this.sessionStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'sessionStop failed', err);
        }
    }

    noOp(): void {
        this.#context.logger.debug('Sending no-op operation.');
        this.#stream.send(FrameType.NoOp, Buffer.allocUnsafe(0));
    }

    // --- System & Session ---

    get sourceVersion(): number {
        return this.#sourceVersion;
    }

    get supportsMediaControl(): boolean {
        return this.#sourceVersion >= 250.3;
    }

    get supportsTextInput(): boolean {
        return this.#sourceVersion >= 340.15;
    }

    get supportsSiriPTT(): boolean {
        return this.#sourceVersion >= 600.20;
    }

    async systemInfo(pairingId: Buffer): Promise<object> {
        const [, payload] = await this.#exchange(Message.systemInfo(pairingId));
        const result = objectOrFail<any>(payload);

        const sv = result?._c?._sv;
        if (sv) {
            this.#sourceVersion = parseFloat(String(sv));
            this.#context.logger.info('[companion-link]', `Receiver sourceVersion: ${sv} (mediaControl=${this.supportsMediaControl}, textInput=${this.supportsTextInput}, siriPTT=${this.supportsSiriPTT})`);
        }

        return result;
    }

    async sessionStart(): Promise<object> {
        const localSid = randomInt(0, 2 ** 32 - 1);
        const [, payload] = await this.#exchange(Message.sessionStart(localSid));

        const result = objectOrFail<any>(payload);
        const remoteSid = Number(result?._c?._sid ?? 0);
        this.#sessionIdLocal = localSid;
        this.#sessionId = (BigInt(remoteSid) << 32n) | BigInt(localSid);

        return result;
    }

    async sessionStop(): Promise<void> {
        if (this.#sessionId === 0n) {
            return;
        }

        await this.#exchange(Message.sessionStop(this.#sessionIdLocal));
        this.#sessionId = 0n;
        this.#sessionIdLocal = 0;
    }

    async tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.tvrcSessionStart());
        return objectOrFail(payload);
    }

    // --- HID ---

    async hidCommand(command: HidCommandKey, down = false): Promise<void> {
        await this.#exchange(Message.hidCommand(HidCommand[command], down));
    }

    async pressButton(command: HidCommandKey, type: ButtonPressType = 'SingleTap', holdDelayMs = 500): Promise<void> {
        switch (type) {
            case 'DoubleTap':
                await this.hidCommand(command, true);
                await this.hidCommand(command, false);
                await this.hidCommand(command, true);
                await this.hidCommand(command, false);
                break;

            case 'Hold':
                await this.hidCommand(command, true);
                await waitFor(holdDelayMs);
                await this.hidCommand(command, false);
                break;

            case 'SingleTap':
                await this.hidCommand(command, true);
                await this.hidCommand(command, false);
                break;
        }
    }

    // --- Touch ---

    async touchStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.touchStart());
        return objectOrFail(payload);
    }

    async touchStop(): Promise<void> {
        await this.#exchange(Message.touchStop());
    }

    async sendTouchEvent(finger: number, phase: number, x: number, y: number): Promise<void> {
        await this.#exchange(Message.touchEvent(finger, phase, x, y));
    }

    // --- Text Input ---

    async tiStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.tiStart());
        return objectOrFail(payload);
    }

    async tiStop(): Promise<void> {
        await this.#exchange(Message.tiStop());
    }

    async textInputCommand(text: string, clearPreviousInput: boolean): Promise<string | null> {
        await this.tiStop();
        const response = await this.tiStart();

        const tiD = (response as any)?._c?._tiD;
        if (!tiD) {
            return null;
        }

        const archive = Plist.parse(Buffer.from(tiD).buffer as ArrayBuffer) as any;
        const objects = archive?.['$objects'];
        const top = archive?.['$top'];
        if (!objects || !top) {
            return null;
        }

        const ref = top.sessionUUID;
        const refIndex = typeof ref === 'object' && ref !== null ? ref['CF$UID'] : ref;
        const sessionUUID = objects[refIndex];

        if (!sessionUUID) {
            return null;
        }

        const sessionBytes = Buffer.from(
            sessionUUID instanceof ArrayBuffer ? sessionUUID
                : sessionUUID instanceof Uint8Array ? sessionUUID
                    : sessionUUID.buffer ?? sessionUUID
        );

        if (clearPreviousInput) {
            this.#sendEvent(Message.tiChange(Buffer.from(Message.buildRtiClearPayload(sessionBytes))));
        }

        if (text) {
            this.#sendEvent(Message.tiChange(Buffer.from(Message.buildRtiInputPayload(sessionBytes, text))));
        }

        return text;
    }

    // --- Media Control ---

    async mediaControlCommand(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<object> {
        const [, payload] = await this.#exchange(Message.mediaControlCommand(MediaControlCommand[command], content));
        return objectOrFail(payload);
    }

    // --- App Launch ---

    async launchApp(bundleId: string): Promise<void> {
        await this.#exchange(Message.launchApp(bundleId));
    }

    async launchUrl(url: string): Promise<void> {
        await this.#exchange(Message.launchUrl(url));
    }

    // --- Fetchers ---

    async fetchMediaControlStatus(): Promise<void> {
        await this.#exchange(Message.fetchMediaControlStatus());
    }

    async fetchNowPlayingInfo(): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchNowPlayingInfo());
        return payload;
    }

    async fetchSupportedActions(): Promise<void> {
        await this.#exchange(Message.fetchSupportedActions());
    }

    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.#exchange(Message.fetchAttentionState());
        const { _c } = objectOrFail<{ _c: { state: number } }>(payload);
        return convertAttentionState(_c.state);
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.#exchange(Message.fetchLaunchableApps());
        const { _c } = objectOrFail<{ _c: Record<string, string> }>(payload);
        return Object.entries(_c).map(([bundleId, name]) => ({ bundleId, name }));
    }

    async getSiriRemoteInfo(): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchSiriRemoteInfo());
        return Plist.parse(Buffer.from((payload as any)['_c']['SiriRemoteInfoKey']).buffer);
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.#exchange(Message.fetchUserAccounts());
        const { _c } = objectOrFail<{ _c: Record<string, string> }>(payload);
        return Object.entries(_c).map(([accountId, name]) => ({ accountId, name }));
    }

    // --- Account ---

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#exchange(Message.switchUserAccount(accountId));
    }

    // --- Interests ---

    subscribe(event: string, fn: (data: unknown) => void): void {
        this.#stream.on(event, fn);
        this.#sendEvent(Message.registerInterests([event]));
    }

    unsubscribe(event: string, fn?: (data: unknown) => void): void {
        if (!this.#stream.isConnected) {
            return;
        }

        if (fn) {
            this.#stream.off(event, fn);
        }

        this.#sendEvent(Message.deregisterInterests([event]));
    }

    registerInterests(events: string[]): void {
        this.#sendEvent(Message.registerInterests(events));
    }

    deregisterInterests(events: string[]): void {
        if (!this.#stream.isConnected) {
            return;
        }

        this.#sendEvent(Message.deregisterInterests(events));
    }

    // --- System Controls (nieuw) ---

    async toggleCaptions(): Promise<void> {
        await this.#exchange(Message.toggleCaptions());
    }

    async toggleSystemAppearance(light: boolean): Promise<void> {
        await this.#exchange(Message.toggleSystemAppearance(light));
    }

    async toggleReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#exchange(Message.toggleReduceLoudSounds(enabled));
    }

    async toggleFindingMode(enabled: boolean): Promise<void> {
        await this.#exchange(Message.toggleFindingMode(enabled));
    }

    // --- Up Next (nieuw) ---

    async fetchUpNext(paginationToken?: string): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchUpNext(paginationToken));
        return payload;
    }

    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.addToUpNext(identifier, kind));
    }

    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.removeFromUpNext(identifier, kind));
    }

    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.markAsWatched(identifier, kind));
    }

    async playMedia(item: Record<string, unknown>): Promise<void> {
        await this.#exchange(Message.playMedia(item));
    }

    // --- Siri (nieuw) ---

    async siriStart(): Promise<void> {
        await this.#exchange(Message.siriStart());
    }

    async siriStop(): Promise<void> {
        await this.#exchange(Message.siriStop());
    }

    // --- Internals ---

    #exchange(message: Record<string, unknown>): Promise<[number, unknown]> {
        return this.#stream.exchange(FrameType.OPackEncrypted, message);
    }

    #sendEvent(message: Record<string, unknown>): void {
        this.#stream.sendOPack(FrameType.OPackEncrypted, message);
    }
}

function objectOrFail<T = object>(obj: unknown): T {
    if (obj !== null && typeof obj === 'object') {
        return obj as T;
    }

    throw new TypeError('Expected an object.');
}
