import { EventEmitter } from 'node:events';
import { CredentialsError, type AccessoryCredentials, type AccessoryKeys, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { type AttentionState, type ButtonPressType, type HidCommandKey, type LaunchableApp, type MediaControlCommandKey, Protocol, type TextInputState, type UserAccount } from '@basmilius/apple-companion-link';
import { CompanionLinkState, type MediaCapabilities } from './companion-link-state';
import { COMPANION_LINK_PROTOCOL } from './const';

/**
 * Events emitted by CompanionLinkDevice.
 * Forwards state change events from CompanionLinkState for convenience.
 */
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
 * High-level abstraction for a Companion Link device (Apple TV).
 * Manages the OPack-based Companion Link protocol lifecycle: connect, pair-verify,
 * session setup, and provides access to HID buttons, app launching, user accounts,
 * media control, text input, touch, Siri, and system controls.
 * Requires credentials (obtained from pair-setup) to connect.
 */
export class CompanionLinkManager extends EventEmitter<EventMap> {
    /**
     * @returns The underlying Companion Link Protocol instance (accessed via symbol for internal use).
     */
    get [COMPANION_LINK_PROTOCOL](): Protocol {
        return this.#protocol;
    }

    /**
     * The mDNS discovery result used to connect to this device.
     */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /**
     * Updates the discovery result, e.g. when the device's address changes.
     */
    set discoveryResult(discoveryResult: DiscoveryResult) {
        this.#discoveryResult = discoveryResult;
    }

    /**
     * Whether the Companion Link stream is currently connected.
     */
    get isConnected(): boolean {
        return this.#protocol?.stream?.isConnected ?? false;
    }

    /**
     * The state tracker for attention, media controls, now-playing, and text input.
     */
    get state(): CompanionLinkState {
        return this.#state;
    }

    /**
     * Current text input session state (convenience accessor).
     */
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

    /**
     * Creates a new CompanionLinkDevice.
     *
     * @param discoveryResult - The mDNS discovery result for the target device.
     */
    constructor(discoveryResult: DiscoveryResult) {
        super();
        this.#discoveryResult = discoveryResult;

        this.onClose = this.onClose.bind(this);
        this.onError = this.onError.bind(this);
        this.onTimeout = this.onTimeout.bind(this);
    }

    // --- Lifecycle ---

    /**
     * Connects to the Companion Link device, performs pair-verify, and sets up
     * all protocol sessions (system info, TVRC, touch, text input).
     * Emits 'connected' on success.
     *
     * @throws CredentialsError when no credentials are set.
     */
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

    /**
     * Gracefully disconnects from the device, clears heartbeat interval, and unsubscribes from events.
     */
    async disconnect(): Promise<void> {
        this.#disconnect = true;

        if (this.#heartbeatInterval) {
            clearInterval(this.#heartbeatInterval);
            this.#heartbeatInterval = undefined;
        }

        this.#state?.unsubscribe();
        await this.#protocol.disconnect();
    }

    /**
     * Disconnects gracefully, swallowing any errors during cleanup.
     */
    async disconnectSafely(): Promise<void> {
        try {
            await this.disconnect();
        } catch {}
    }

    /**
     * Sets the pairing credentials required for pair-verify authentication.
     * Must be called before connect().
     *
     * @param credentials - The accessory credentials from pair-setup.
     */
    async setCredentials(credentials: AccessoryCredentials): Promise<void> {
        this.#credentials = credentials;
    }

    // --- Fetchers ---

    /**
     * Fetches the current attention state of the device (active, idle, screensaver, etc.).
     *
     * @returns The current attention state.
     */
    async getAttentionState(): Promise<AttentionState> {
        return await this.#protocol.getAttentionState();
    }

    /**
     * Fetches the list of apps that can be launched on the device.
     *
     * @returns Array of launchable app descriptors.
     */
    async getLaunchableApps(): Promise<LaunchableApp[]> {
        return await this.#protocol.getLaunchableApps();
    }

    /**
     * Fetches the list of user accounts configured on the device.
     *
     * @returns Array of user account descriptors.
     */
    async getUserAccounts(): Promise<UserAccount[]> {
        return await this.#protocol.getUserAccounts();
    }

    /**
     * Fetches the current now-playing information from the device.
     *
     * @returns The now-playing info payload.
     */
    async fetchNowPlayingInfo(): Promise<any> {
        return await this.#protocol.fetchNowPlayingInfo();
    }

    /**
     * Fetches the currently supported actions from the device.
     *
     * @returns The supported actions payload.
     */
    async fetchSupportedActions(): Promise<any> {
        return await this.#protocol.fetchSupportedActions();
    }

    /**
     * Fetches the current media control status (available controls bitmask).
     *
     * @returns The media control status payload.
     */
    async fetchMediaControlStatus(): Promise<any> {
        return await this.#protocol.fetchMediaControlStatus();
    }

    // --- Commands ---

    /**
     * Launches an app on the device by its bundle identifier.
     *
     * @param bundleId - The bundle identifier of the app to launch.
     */
    async launchApp(bundleId: string): Promise<void> {
        await this.#protocol.launchApp(bundleId);
    }

    /**
     * Opens a URL on the device (universal link or app-specific URL scheme).
     *
     * @param url - The URL to open.
     */
    async launchUrl(url: string): Promise<void> {
        await this.#protocol.launchUrl(url);
    }

    /**
     * Sends a media control command (play, pause, next, etc.) via the Companion Link protocol.
     *
     * @param command - The media control command key.
     * @param content - Optional additional content for the command.
     */
    async mediaControlCommand(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<void> {
        await this.#protocol.mediaControlCommand(command, content);
    }

    /**
     * Sends a HID button press via the Companion Link protocol.
     *
     * @param command - The HID command key (e.g. 'up', 'select', 'menu').
     * @param type - Optional press type (short, long, double).
     * @param holdDelayMs - Optional hold duration in milliseconds for long presses.
     */
    async pressButton(command: HidCommandKey, type?: ButtonPressType, holdDelayMs?: number): Promise<void> {
        await this.#protocol.pressButton(command, type, holdDelayMs);
    }

    /**
     * Switches to a different user account on the device.
     *
     * @param accountId - The ID of the user account to switch to.
     */
    async switchUserAccount(accountId: string): Promise<void> {
        await this.#protocol.switchUserAccount(accountId);
    }

    // --- Text Input ---

    /**
     * Sets the text input field to the given text, replacing any existing content.
     *
     * @param text - The text to set.
     */
    async textSet(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, true);
    }

    /**
     * Appends text to the current text input field content.
     *
     * @param text - The text to append.
     */
    async textAppend(text: string): Promise<void> {
        await this.#protocol.textInputCommand(text, false);
    }

    /**
     * Clears the text input field.
     */
    async textClear(): Promise<void> {
        await this.#protocol.textInputCommand('', true);
    }

    // --- Touch ---

    /**
     * Sends a raw touch event to the device.
     *
     * @param finger - Finger index (0-based).
     * @param phase - Touch phase (0 = Began, 1 = Moved, 2 = Ended).
     * @param x - Horizontal position.
     * @param y - Vertical position.
     */
    async sendTouchEvent(finger: number, phase: number, x: number, y: number): Promise<void> {
        await this.#protocol.sendTouchEvent(finger, phase, x, y);
    }

    /**
     * Simulates a tap at the given coordinates.
     *
     * @param x - Horizontal position (defaults to center 500).
     * @param y - Vertical position (defaults to center 500).
     */
    async tap(x: number = 500, y: number = 500): Promise<void> {
        await this.sendTouchEvent(0, 0, x, y);
        await waitFor(50);
        await this.sendTouchEvent(0, 2, x, y);
    }

    /**
     * Simulates a swipe gesture in the given direction.
     *
     * @param direction - Swipe direction.
     * @param duration - Swipe duration in milliseconds (defaults to 200).
     */
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

    /**
     * Toggles closed captions on the device.
     */
    async toggleCaptions(): Promise<void> {
        await this.#protocol.toggleCaptions();
    }

    /**
     * Toggles the system appearance between light and dark mode.
     *
     * @param light - True for light mode, false for dark mode.
     */
    async toggleSystemAppearance(light: boolean): Promise<void> {
        await this.#protocol.toggleSystemAppearance(light);
    }

    /**
     * Enables or disables the "Reduce Loud Sounds" setting.
     *
     * @param enabled - Whether to enable the setting.
     */
    async toggleReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#protocol.toggleReduceLoudSounds(enabled);
    }

    /**
     * Enables or disables finding mode (Find My integration).
     *
     * @param enabled - Whether to enable finding mode.
     */
    async toggleFindingMode(enabled: boolean): Promise<void> {
        await this.#protocol.toggleFindingMode(enabled);
    }

    // --- Up Next ---

    /**
     * Fetches the "Up Next" queue from the device.
     *
     * @param paginationToken - Optional token for paginated results.
     * @returns The Up Next queue payload.
     */
    async fetchUpNext(paginationToken?: string): Promise<any> {
        return await this.#protocol.fetchUpNext(paginationToken);
    }

    /**
     * Adds an item to the "Up Next" queue.
     *
     * @param identifier - Content item identifier.
     * @param kind - Content kind descriptor.
     */
    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#protocol.addToUpNext(identifier, kind);
    }

    /**
     * Removes an item from the "Up Next" queue.
     *
     * @param identifier - Content item identifier.
     * @param kind - Content kind descriptor.
     */
    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#protocol.removeFromUpNext(identifier, kind);
    }

    /**
     * Marks a content item as watched.
     *
     * @param identifier - Content item identifier.
     * @param kind - Content kind descriptor.
     */
    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#protocol.markAsWatched(identifier, kind);
    }

    // --- Siri ---

    /**
     * Starts a Siri session on the device.
     */
    async siriStart(): Promise<void> {
        await this.#protocol.siriStart();
    }

    /**
     * Stops the active Siri session on the device.
     */
    async siriStop(): Promise<void> {
        await this.#protocol.siriStop();
    }

    // --- Internals ---

    /**
     * Sets up encryption, protocol sessions (system info, TVRC, touch, text input),
     * heartbeat interval, and state tracking. Called after successful pair-verify.
     */
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

            // Remove old forwarding listeners to prevent leaks on reconnect.
            if (this.#state) {
                this.#state.removeAllListeners();
            }

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

    /**
     * Handles the stream close event. Emits 'disconnected' with unexpected=true if not intentional.
     */
    onClose(): void {
        this.#protocol.context.logger.net('onClose() called on companion link device.');

        if (!this.#disconnect) {
            this.disconnectSafely();
            this.emit('disconnected', true);
        } else {
            this.emit('disconnected', false);
        }
    }

    /**
     * Handles stream error events by logging them.
     *
     * @param err - The error that occurred.
     */
    onError(err: Error): void {
        this.#protocol.context.logger.error('Companion Link error', err);
    }

    /**
     * Handles stream timeout events by destroying the stream.
     */
    onTimeout(): void {
        this.#protocol.context.logger.error('Companion Link timeout');
        this.#protocol.stream.destroy();
    }
}
