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

/**
 * High-level Companion Link protocol client for Apple TV.
 *
 * Provides methods for all Companion Link operations: system handshake, session
 * management, HID remote control, touch input, text input (RTI), media control,
 * app launching, system settings, Up Next queue management, Siri PTT, and
 * presence publishing. All communication flows through an encrypted OPack stream.
 *
 * Typical lifecycle:
 * 1. `connect()` - establish TCP connection
 * 2. `verify.start(credentials)` - pair-verify and enable encryption
 * 3. `systemInfo(pairingId)` - exchange system information
 * 4. `sessionStart()` / `tvrcSessionStart()` - open service sessions
 * 5. Use HID, touch, text input, media control, etc.
 * 6. `disconnect()` - gracefully tear down
 */
export default class Protocol {
    /** The device context providing logger, storage, and identity. */
    get context(): Context {
        return this.#context;
    }

    /** The mDNS discovery result used to locate this Apple TV. */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /** The pair-setup handler for this protocol instance. */
    get pairing(): Pairing {
        return this.#pairing;
    }

    /** The underlying encrypted OPack stream. */
    get stream(): Stream {
        return this.#stream;
    }

    /** The pair-verify handler for this protocol instance. */
    get verify(): Verify {
        return this.#verify;
    }

    readonly #context: Context;
    readonly #discoveryResult: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #stream: Stream;
    readonly #verify: Verify;

    /** The combined session identifier (remote SID << 32 | local SID). */
    #sessionId: bigint = 0n;

    /** The locally generated session identifier. */
    #sessionIdLocal: number = 0;

    /** The Apple TV's reported source version, used for feature detection. */
    #sourceVersion: number = 0;

    /**
     * @param discoveryResult - The mDNS discovery result containing the Apple TV's address, port, and service info.
     */
    constructor(discoveryResult: DiscoveryResult) {
        this.#context = new Context(discoveryResult.id);
        this.#discoveryResult = discoveryResult;
        this.#stream = new Stream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    // --- Lifecycle ---

    /**
     * Opens the TCP connection to the Apple TV's Companion Link port.
     */
    async connect(): Promise<void> {
        await this.#stream.connect();
    }

    /**
     * Immediately destroys the stream without graceful shutdown.
     */
    destroy(): void {
        this.#stream.destroy();
    }

    /**
     * Gracefully disconnects by stopping active sessions and then closing the stream.
     * Suppresses errors during the graceful stop phase to ensure the connection is always closed.
     */
    async disconnect(): Promise<void> {
        try {
            await this.gracefulStop();
        } catch (err) {
            this.#context.logger.warn('[companion-link]', 'Graceful stop failed during disconnect', err);
        }

        await this.#stream.disconnect();
    }

    /**
     * Attempts to cleanly shut down all active subsystems: deregisters interests,
     * stops text input and touch sessions, and terminates the service session.
     * Individual failures are logged but do not prevent other cleanup steps.
     */
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

    /**
     * Sends a no-op frame to keep the connection alive.
     * NoOp frames are always sent unencrypted regardless of encryption state.
     */
    noOp(): void {
        this.#context.logger.debug('Sending no-op operation.');
        this.#stream.send(FrameType.NoOp, Buffer.allocUnsafe(0));
    }

    // --- System & Session ---

    /** The Apple TV's reported protocol source version number (e.g. `715.2`). */
    get sourceVersion(): number {
        return this.#sourceVersion;
    }

    /** Whether this Apple TV supports media control commands (sourceVersion >= 250.3). */
    get supportsMediaControl(): boolean {
        return this.#sourceVersion >= 250.3;
    }

    /** Whether this Apple TV supports remote text input (sourceVersion >= 340.15). */
    get supportsTextInput(): boolean {
        return this.#sourceVersion >= 340.15;
    }

    /** Whether this Apple TV supports Siri push-to-talk (sourceVersion >= 600.20). */
    get supportsSiriPTT(): boolean {
        return this.#sourceVersion >= 600.20;
    }

    /**
     * Exchanges system information with the Apple TV during the initial handshake.
     * Parses the response to extract and store the receiver's source version for
     * feature detection.
     *
     * @param pairingId - The controller's pairing identifier.
     * @returns The raw system info response object from the Apple TV.
     * @throws TypeError if the response is not an object.
     */
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

    /**
     * Starts a TV Remote Services session with the Apple TV.
     * Generates a random local session ID and combines it with the remote session ID
     * to form the full 64-bit composite session identifier.
     *
     * @returns The raw session start response object.
     * @throws TypeError if the response is not an object.
     */
    async sessionStart(): Promise<object> {
        const localSid = randomInt(0, 2 ** 32 - 1);
        const [, payload] = await this.#exchange(Message.sessionStart(localSid));

        const result = objectOrFail<any>(payload);
        const remoteSid = Number(result?._c?._sid ?? 0);
        this.#sessionIdLocal = localSid;
        this.#sessionId = (BigInt(remoteSid) << 32n) | BigInt(localSid);

        return result;
    }

    /**
     * Stops the active TV Remote Services session.
     * No-ops if no session is currently active.
     */
    async sessionStop(): Promise<void> {
        if (this.#sessionId === 0n) {
            return;
        }

        await this.#exchange(Message.sessionStop(this.#sessionIdLocal));
        this.#sessionId = 0n;
        this.#sessionIdLocal = 0;
    }

    /**
     * Starts a TV Remote Control session, which activates the `tvremoted` process
     * on the Apple TV for HID and touch input handling.
     *
     * @returns The raw TVRC session start response object.
     * @throws TypeError if the response is not an object.
     */
    async tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.tvrcSessionStart());
        return objectOrFail(payload);
    }

    // --- HID ---

    /**
     * Sends a single HID button event (down or up) to the Apple TV.
     *
     * @param command - The HID command name (e.g. `Select`, `Menu`, `VolumeUp`).
     * @param down - Whether this is a button-down (`true`) or button-up (`false`) event.
     */
    async hidCommand(command: HidCommandKey, down = false): Promise<void> {
        await this.#exchange(Message.hidCommand(HidCommand[command], down));
    }

    /**
     * Performs a complete button press gesture (down + up) with the specified interaction type.
     * - `SingleTap`: press and release immediately.
     * - `DoubleTap`: two quick press-release cycles.
     * - `Hold`: press, wait for the hold delay, then release.
     *
     * @param command - The HID command name.
     * @param type - The press interaction type.
     * @param holdDelayMs - Duration in milliseconds to hold the button for `Hold` type.
     */
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

    /**
     * Starts a virtual touchpad session on the Apple TV.
     *
     * @returns The touch start response object.
     * @throws TypeError if the response is not an object.
     */
    async touchStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.touchStart());
        return objectOrFail(payload);
    }

    /**
     * Stops the active virtual touchpad session.
     */
    async touchStop(): Promise<void> {
        await this.#exchange(Message.touchStop());
    }

    /**
     * Sends a touch event to the virtual touchpad.
     *
     * @param finger - The finger index (0-based, supports multi-touch).
     * @param phase - The touch phase (see {@link TouchPhase}).
     * @param x - Horizontal position in the touchpad coordinate space (0-1000).
     * @param y - Vertical position in the touchpad coordinate space (0-1000).
     */
    async sendTouchEvent(finger: number, phase: number, x: number, y: number): Promise<void> {
        await this.#exchange(Message.touchEvent(finger, phase, x, y));
    }

    // --- Text Input ---

    /**
     * Starts a Remote Text Input (RTI) session.
     * The response contains the keyboard session UUID needed for sending text.
     *
     * @returns The text input start response containing session info.
     * @throws TypeError if the response is not an object.
     */
    async tiStart(): Promise<object> {
        const [, payload] = await this.#exchange(Message.tiStart());
        return objectOrFail(payload);
    }

    /**
     * Stops the active Remote Text Input session.
     */
    async tiStop(): Promise<void> {
        await this.#exchange(Message.tiStop());
    }

    /**
     * Sends text to the currently focused input field on the Apple TV.
     * Restarts the RTI session to obtain a fresh keyboard session UUID,
     * optionally clears existing text, then inserts the new text.
     *
     * @param text - The text to type into the input field.
     * @param clearPreviousInput - Whether to clear the existing text before typing.
     * @returns The text that was sent, or `null` if no keyboard session was available.
     */
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

    /**
     * Sends a media control command to the Apple TV.
     *
     * @param command - The media control command name (e.g. `Play`, `Pause`, `SetVolume`).
     * @param content - Optional additional parameters (e.g. volume level).
     * @returns The media control response object.
     * @throws TypeError if the response is not an object.
     */
    async mediaControlCommand(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<object> {
        const [, payload] = await this.#exchange(Message.mediaControlCommand(MediaControlCommand[command], content));
        return objectOrFail(payload);
    }

    // --- App Launch ---

    /**
     * Launches an app on the Apple TV by its bundle identifier.
     *
     * @param bundleId - The bundle identifier of the app to launch.
     */
    async launchApp(bundleId: string): Promise<void> {
        await this.#exchange(Message.launchApp(bundleId));
    }

    /**
     * Opens a URL on the Apple TV via universal links.
     *
     * @param url - The URL to open.
     */
    async launchUrl(url: string): Promise<void> {
        await this.#exchange(Message.launchUrl(url));
    }

    // --- Fetchers ---

    /**
     * Fetches the current media control status (supported capabilities).
     */
    async fetchMediaControlStatus(): Promise<void> {
        await this.#exchange(Message.fetchMediaControlStatus());
    }

    /**
     * Fetches the current now-playing information from the Apple TV.
     *
     * @returns The raw now-playing payload.
     */
    async fetchNowPlayingInfo(): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchNowPlayingInfo());
        return payload;
    }

    /**
     * Fetches the list of currently supported remote actions.
     */
    async fetchSupportedActions(): Promise<void> {
        await this.#exchange(Message.fetchSupportedActions());
    }

    /**
     * Fetches and converts the Apple TV's current attention (power) state.
     *
     * @returns The attention state as a human-readable string.
     * @throws TypeError if the response is not an object.
     */
    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.#exchange(Message.fetchAttentionState());
        const { _c } = objectOrFail<{ _c: { state: number } }>(payload);
        return convertAttentionState(_c.state);
    }

    /**
     * Fetches the list of apps that can be launched on the Apple TV.
     *
     * @returns An array of launchable apps with their bundle IDs and display names.
     * @throws TypeError if the response is not an object.
     */
    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.#exchange(Message.fetchLaunchableApps());
        const { _c } = objectOrFail<{ _c: Record<string, string> }>(payload);
        return Object.entries(_c).map(([bundleId, name]) => ({ bundleId, name }));
    }

    /**
     * Fetches Siri Remote hardware and configuration information.
     * The response is a binary plist embedded within the OPack payload.
     *
     * @returns The parsed Siri Remote info plist.
     */
    async getSiriRemoteInfo(): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchSiriRemoteInfo());
        return Plist.parse(Buffer.from((payload as any)['_c']['SiriRemoteInfoKey']).buffer);
    }

    /**
     * Fetches the user accounts registered on the Apple TV.
     *
     * @returns An array of user accounts with their IDs and display names.
     * @throws TypeError if the response is not an object.
     */
    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.#exchange(Message.fetchUserAccounts());
        const { _c } = objectOrFail<{ _c: Record<string, string> }>(payload);
        return Object.entries(_c).map(([accountId, name]) => ({ accountId, name }));
    }

    // --- Account ---

    /**
     * Switches the active user account on the Apple TV.
     *
     * @param accountId - The identifier of the account to switch to.
     */
    async switchUserAccount(accountId: string): Promise<void> {
        await this.#exchange(Message.switchUserAccount(accountId));
    }

    // --- Interests ---

    /**
     * Subscribes to a server-sent event by registering interest and adding a listener.
     *
     * @param event - The event identifier to subscribe to (e.g. `_iMC`, `SystemStatus`).
     * @param fn - The callback to invoke when the event is received.
     */
    subscribe(event: string, fn: (data: unknown) => void): void {
        this.#stream.on(event, fn);
        this.#sendEvent(Message.registerInterests([event]));
    }

    /**
     * Unsubscribes from a server-sent event by deregistering interest and removing the listener.
     * No-ops if the stream is not connected.
     *
     * @param event - The event identifier to unsubscribe from.
     * @param fn - Optional specific callback to remove. If omitted, only deregisters the interest.
     */
    unsubscribe(event: string, fn?: (data: unknown) => void): void {
        if (!this.#stream.isConnected) {
            return;
        }

        if (fn) {
            this.#stream.off(event, fn);
        }

        this.#sendEvent(Message.deregisterInterests([event]));
    }

    /**
     * Registers interest in multiple server-sent events without adding listeners.
     *
     * @param events - The event identifiers to register for.
     */
    registerInterests(events: string[]): void {
        this.#sendEvent(Message.registerInterests(events));
    }

    /**
     * Deregisters interest in multiple server-sent events.
     * No-ops if the stream is not connected.
     *
     * @param events - The event identifiers to deregister from.
     */
    deregisterInterests(events: string[]): void {
        if (!this.#stream.isConnected) {
            return;
        }

        this.#sendEvent(Message.deregisterInterests(events));
    }

    // --- System Controls ---

    /**
     * Toggles closed captions on the Apple TV.
     */
    async toggleCaptions(): Promise<void> {
        await this.#exchange(Message.toggleCaptions());
    }

    /**
     * Toggles the Apple TV's system appearance between light and dark mode.
     *
     * @param light - Whether to switch to light mode (`true`) or dark mode (`false`).
     */
    async toggleSystemAppearance(light: boolean): Promise<void> {
        await this.#exchange(Message.toggleSystemAppearance(light));
    }

    /**
     * Toggles the "Reduce Loud Sounds" audio setting on the Apple TV.
     *
     * @param enabled - Whether to enable or disable the feature.
     */
    async toggleReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#exchange(Message.toggleReduceLoudSounds(enabled));
    }

    /**
     * Toggles Finding Mode (Find My) on the Apple TV.
     *
     * @param enabled - Whether to enable or disable finding mode.
     */
    async toggleFindingMode(enabled: boolean): Promise<void> {
        await this.#exchange(Message.toggleFindingMode(enabled));
    }

    // --- Up Next ---

    /**
     * Fetches the Up Next queue from the Apple TV.
     *
     * @param paginationToken - Optional token to fetch the next page of results.
     * @returns The raw Up Next payload.
     */
    async fetchUpNext(paginationToken?: string): Promise<any> {
        const [, payload] = await this.#exchange(Message.fetchUpNext(paginationToken));
        return payload;
    }

    /**
     * Adds a media item to the Up Next queue.
     *
     * @param identifier - The content identifier of the media item.
     * @param kind - The content kind (e.g. movie, episode).
     */
    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.addToUpNext(identifier, kind));
    }

    /**
     * Removes a media item from the Up Next queue.
     *
     * @param identifier - The content identifier of the media item.
     * @param kind - The content kind (e.g. movie, episode).
     */
    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.removeFromUpNext(identifier, kind));
    }

    /**
     * Marks a media item as watched.
     *
     * @param identifier - The content identifier of the media item.
     * @param kind - The content kind (e.g. movie, episode).
     */
    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#exchange(Message.markAsWatched(identifier, kind));
    }

    /**
     * Plays a specific media item on the Apple TV.
     *
     * @param item - The media item descriptor with playback parameters.
     */
    async playMedia(item: Record<string, unknown>): Promise<void> {
        await this.#exchange(Message.playMedia(item));
    }

    // --- Siri ---

    /**
     * Activates Siri via push-to-talk on the Apple TV.
     * Requires sourceVersion >= 600.20 (see {@link supportsSiriPTT}).
     */
    async siriStart(): Promise<void> {
        await this.#exchange(Message.siriStart());
    }

    /**
     * Deactivates Siri (releases push-to-talk) on the Apple TV.
     */
    async siriStop(): Promise<void> {
        await this.#exchange(Message.siriStop());
    }

    // --- Internals ---

    /**
     * Sends an encrypted OPack message and waits for the correlated response.
     *
     * @param message - The OPack message object to send.
     * @returns A tuple of `[headerByte, decodedPayload]` from the response.
     */
    #exchange(message: Record<string, unknown>): Promise<[number, unknown]> {
        return this.#stream.exchange(FrameType.OPackEncrypted, message);
    }

    /**
     * Sends an encrypted OPack event message (fire-and-forget, no response expected).
     *
     * @param message - The OPack event message object to send.
     */
    #sendEvent(message: Record<string, unknown>): void {
        this.#stream.sendOPack(FrameType.OPackEncrypted, message);
    }
}

/**
 * Asserts that the given value is a non-null object and returns it with the expected type.
 *
 * @param obj - The value to validate.
 * @returns The value cast to the expected type.
 * @throws TypeError if the value is not a non-null object.
 */
function objectOrFail<T = object>(obj: unknown): T {
    if (obj !== null && typeof obj === 'object') {
        return obj as T;
    }

    throw new TypeError('Expected an object.');
}
