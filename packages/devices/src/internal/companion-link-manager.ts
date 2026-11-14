import { EventEmitter } from 'node:events';
import { ConnectionClosedError, CredentialsError } from '@corewire/core';
import type { AccessoryCredentials } from '@corewire/core/pairing';
import type { DiscoveryResult } from '@corewire/core/discovery';
import { type AttentionState, type ButtonPressType, type CompanionLinkSession, CompanionLinkState, connect, type HidCommandKey, type LaunchableApp, type MediaCapabilities, type MediaControlCommandKey, SetupClosedError, type SwipeDirection, type TextInputState, toTarget, type UserAccount } from '@corewire/companion-link';
import { COMPANION_LINK_PROTOCOL } from './const';

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

/**
 * The Companion Link side of an Apple TV: one session at a time, built from the stored discovery
 * result and credentials on every connect. Nothing reconnects by itself. A disconnect this side
 * asked for emits nothing; a session the device or the socket ended emits `disconnected(true)`.
 *
 * The state outlives the sessions: each session feeds the same one, a connect clears it, a
 * disconnect leaves the last values readable.
 */
export class CompanionLinkManager extends EventEmitter<EventMap> {
    /** The current session, or the last one after it ended. */
    get [COMPANION_LINK_PROTOCOL](): CompanionLinkSession | undefined {
        return this.#session;
    }

    /** The mDNS discovery result the next connect uses. */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /** Updates the discovery result, e.g. when the device's address changes. Takes effect on the next connect. */
    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    /**
     * The controller's active iCloud account (alternate DSID) to announce during the startup.
     * Optional: when left unset, no `SwitchActiveUserAccountEvent` is sent, as with real controllers.
     */
    get activeUserAccount(): string | undefined {
        return this.#activeUserAccount;
    }

    set activeUserAccount(iCloudAltDSID: string | undefined) {
        this.#activeUserAccount = iCloudAltDSID;
    }

    /** Whether the socket of the current session is connected; true until a graceful close finishes. */
    get isConnected(): boolean {
        return this.#session?.stream.isConnected ?? false;
    }

    get state(): CompanionLinkState {
        return this.#state;
    }

    get textInputState(): TextInputState {
        return this.#state.textInputState;
    }

    readonly #state: CompanionLinkState = new CompanionLinkState();
    #abort?: AbortController;
    #activeUserAccount?: string;
    #connecting?: Promise<void>;
    #credentials?: AccessoryCredentials;
    #disconnect: boolean = false;
    #discoveryResult: DiscoveryResult;
    #generation: number = 0;
    #session?: CompanionLinkSession;

    constructor(discoveryResult: DiscoveryResult) {
        super();

        this.#discoveryResult = discoveryResult;

        this.#state.on('attentionStateChanged', state => this.emit('attentionStateChanged', state));
        this.#state.on('mediaControlFlagsChanged', (flags, capabilities) => this.emit('mediaControlFlagsChanged', flags, capabilities));
        this.#state.on('nowPlayingInfoChanged', info => this.emit('nowPlayingInfoChanged', info));
        this.#state.on('supportedActionsChanged', actions => this.emit('supportedActionsChanged', actions));
        this.#state.on('textInputChanged', state => this.emit('textInputChanged', state));
        this.#state.on('volumeAvailabilityChanged', available => this.emit('volumeAvailabilityChanged', available));
    }

    /**
     * Connects with the stored credentials and emits `connected`. Concurrent calls share one
     * attempt, and a connected session is kept. A previous session is closed first.
     *
     * @throws {CredentialsError} When no credentials are set.
     */
    async connect(): Promise<void> {
        if (this.#connecting) {
            return this.#connecting;
        }

        if (this.isConnected && !this.#disconnect) {
            return;
        }

        if (!this.#credentials) {
            throw new CredentialsError('Credentials are required to connect to a Companion Link device.');
        }

        const operation = this.#connect();
        this.#connecting = operation;

        try {
            await operation;
        } finally {
            if (this.#connecting === operation) {
                this.#connecting = undefined;
            }
        }
    }

    /**
     * Closes the session gracefully, or interrupts a connect in flight. Emits nothing: only a
     * close this side did not ask for counts as a disconnect.
     */
    async disconnect(): Promise<void> {
        this.#disconnect = true;
        this.#generation++;

        if (this.#connecting) {
            this.#abort?.abort();

            return;
        }

        await this.#session?.close();
    }

    /** {@link disconnect}, swallowing errors. */
    async disconnectSafely(): Promise<void> {
        try {
            await this.disconnect();
        } catch {
        }
    }

    /** The credentials the next connect uses for pair-verify. */
    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    async getAttentionState(): Promise<AttentionState> {
        return await this.#requireSession().power.fetch();
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#requireSession().apps.list();
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#requireSession().accounts.list();
    }

    async fetchNowPlayingInfo(): Promise<any> {
        return await this.#requireSession().media.fetchNowPlayingInfo();
    }

    async fetchSupportedActions(): Promise<any> {
        return await this.#requireSession().media.fetchSupportedActions();
    }

    async fetchMediaControlStatus(): Promise<any> {
        return await this.#requireSession().media.fetchControlStatus();
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#requireSession().apps.launch(bundleId);
    }

    /** Opens a URL on the device (universal link or app-specific URL scheme). */
    async launchUrl(url: string): Promise<void> {
        await this.#requireSession().apps.openUrl(url);
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<void> {
        await this.#requireSession().media.command(command, content);
    }

    async pressButton(command: HidCommandKey, type?: ButtonPressType, holdDelayMs?: number): Promise<void> {
        await this.#requireSession().hid.press(command, type, holdDelayMs);
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#requireSession().accounts.switch(accountId);
    }

    /** Announces the controller's active iCloud account (alternate DSID) to the device now. */
    async switchActiveUserAccount(iCloudAltDSID: string): Promise<void> {
        await this.#requireSession().accounts.switchActive(iCloudAltDSID);
    }

    /** Replaces the text of the focused field. */
    async textSet(text: string): Promise<void> {
        await this.#requireSession().text.set(text);
    }

    async textAppend(text: string): Promise<void> {
        await this.#requireSession().text.append(text);
    }

    async textClear(): Promise<void> {
        await this.#requireSession().text.clear();
    }

    /** Sends a `_touchC` event; tvOS ignores it, {@link sendHidTouchEvent} is what reaches the device. */
    async sendTouchEvent(finger: number, phase: number, x: number, y: number): Promise<void> {
        this.#requireSession().touch.send(finger, phase, x, y);
    }

    /** Sends a `_hidT` touch event: finger 1-based, coordinates 0 to 1000. */
    sendHidTouchEvent(finger: number, phase: number, x: number, y: number): void {
        this.#requireSession().touch.sendHid(finger, phase, x, y);
    }

    /** Selects what has focus, the way a tap on the touch surface does; held when `holdMs` is given. */
    async tap(holdMs?: number): Promise<void> {
        await this.#requireSession().touch.tap(holdMs);
    }

    /** @param duration Milliseconds; 200 when omitted. */
    async swipe(direction: SwipeDirection, duration: number = 200): Promise<void> {
        await this.#requireSession().touch.swipe(direction, duration);
    }

    async toggleCaptions(): Promise<void> {
        await this.#requireSession().system.toggleCaptions();
    }

    /** Light mode when true, dark mode when false. */
    async toggleSystemAppearance(light: boolean): Promise<void> {
        await this.#requireSession().system.setAppearance(light);
    }

    async toggleReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#requireSession().system.setReduceLoudSounds(enabled);
    }

    async toggleFindingMode(enabled: boolean): Promise<void> {
        await this.#requireSession().system.setFindingMode(enabled);
    }

    async fetchUpNext(paginationToken?: string): Promise<any> {
        return await this.#requireSession().system.fetchUpNext(paginationToken);
    }

    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#requireSession().system.addToUpNext(identifier, kind);
    }

    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#requireSession().system.removeFromUpNext(identifier, kind);
    }

    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#requireSession().system.markAsWatched(identifier, kind);
    }

    async siriStart(): Promise<void> {
        await this.#requireSession().system.siriStart();
    }

    async siriStop(): Promise<void> {
        await this.#requireSession().system.siriStop();
    }

    async #connect(): Promise<void> {
        const cleanup = this.disconnectSafely();
        const generation = this.#generation;

        await cleanup;

        if (generation !== this.#generation) {
            throw new Error('Companion Link connect cancelled.');
        }

        const abort = new AbortController();
        this.#abort = abort;
        this.#disconnect = false;
        this.#state.clear();

        let session: CompanionLinkSession | undefined;

        try {
            session = await connect(toTarget(this.#discoveryResult), {
                credentials: this.#credentials,
                activeUserAccount: this.#activeUserAccount,
                state: this.#state,
                signal: abort.signal
            });

            if (generation !== this.#generation || this.#disconnect) {
                throw new Error('Companion Link connect cancelled.');
            }

            const current = session;
            this.#session = current;

            current.on('closed', () => this.#onClosed(current));
        } catch (error) {
            abort.abort();

            // A device that drops the socket during the handshake counts as a disconnect, as one after it does.
            if (error instanceof SetupClosedError && generation === this.#generation && !this.#disconnect) {
                this.#disconnect = true;
                this.disconnectSafely();
                this.emit('disconnected', true);
            } else if (generation === this.#generation) {
                await this.disconnectSafely();
            }

            throw error;
        }

        this.emit('connected');
    }

    /** A close nobody asked for: the device, the socket or a broken frame ended the session. */
    #onClosed(session: CompanionLinkSession): void {
        if (this.#session !== session || this.#disconnect) {
            return;
        }

        session.context.logger.net('onClose() called on companion link device.');

        this.#disconnect = true;
        this.disconnectSafely();
        this.emit('disconnected', true);
    }

    /** The current session, or the last one, whose requests then fail with ConnectionClosedError. */
    #requireSession(): CompanionLinkSession {
        if (!this.#session) {
            throw new ConnectionClosedError('Companion Link is not connected.');
        }

        return this.#session;
    }
}
