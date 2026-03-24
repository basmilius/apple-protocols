import { EventEmitter } from 'node:events';
import { MediaControlFlag, type Protocol } from '@basmilius/apple-companion-link';
import { NSKeyedArchiver, Plist } from '@basmilius/apple-encoding';
import type { AttentionState, TextInputState } from '@basmilius/apple-companion-link';
import { convertAttentionState } from '@basmilius/apple-companion-link';

/**
 * Events emitted by CompanionLinkState.
 * Provides reactive state updates from the Companion Link protocol.
 */
type EventMap = {
    readonly attentionStateChanged: [AttentionState];
    readonly mediaControlFlagsChanged: [flags: number, capabilities: MediaCapabilities];
    readonly nowPlayingInfoChanged: [info: Record<string, unknown> | null];
    readonly supportedActionsChanged: [actions: Record<string, unknown>];
    readonly textInputChanged: [TextInputState];
    readonly volumeAvailabilityChanged: [available: boolean];
};

/**
 * Parsed media control capabilities, indicating which playback controls
 * are currently available on the device.
 */
export type MediaCapabilities = {
    readonly play: boolean;
    readonly pause: boolean;
    readonly nextTrack: boolean;
    readonly previousTrack: boolean;
    readonly fastForward: boolean;
    readonly rewind: boolean;
    readonly volume: boolean;
    readonly skipForward: boolean;
    readonly skipBackward: boolean;
};

/** Default text input state when no text input session is active. */
const DEFAULT_TEXT_INPUT: TextInputState = {
    isActive: false,
    documentText: '',
    isSecure: false,
    keyboardType: 0,
    autocorrection: false,
    autocapitalization: false
};

/**
 * Tracks the state of a Companion Link device: attention state, media controls,
 * now-playing info, supported actions, text input, and volume availability.
 * Subscribes to protocol stream events and emits typed state change events.
 */
export default class CompanionLinkState extends EventEmitter<EventMap> {
    /** Current attention state of the device (active, idle, screensaver, etc.). */
    get attentionState(): AttentionState {
        return this.#attentionState;
    }

    /** Parsed media capabilities indicating which controls are available. */
    get mediaCapabilities(): MediaCapabilities {
        return this.#mediaCapabilities;
    }

    /** Raw media control flags bitmask from the device. */
    get mediaControlFlags(): number {
        return this.#mediaControlFlags;
    }

    /** Current now-playing info as a key-value dictionary, or null. */
    get nowPlayingInfo(): Record<string, unknown> | null {
        return this.#nowPlayingInfo;
    }

    /** Currently supported actions dictionary, or null. */
    get supportedActions(): Record<string, unknown> | null {
        return this.#supportedActions;
    }

    /** Current text input session state. */
    get textInputState(): TextInputState {
        return this.#textInputState;
    }

    /** Whether volume control is currently available via the Companion Link protocol. */
    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    readonly #protocol: Protocol;
    #attentionState: AttentionState = 'unknown';
    #mediaCapabilities: MediaCapabilities = parseMediaControlFlags(0);
    #mediaControlFlags: number = 0;
    #nowPlayingInfo: Record<string, unknown> | null = null;
    #supportedActions: Record<string, unknown> | null = null;
    #textInputState: TextInputState = { ...DEFAULT_TEXT_INPUT };
    #volumeAvailable: boolean = false;

    /**
     * Creates a new CompanionLinkState tracker.
     *
     * @param protocol - The Companion Link protocol instance to observe.
     */
    constructor(protocol: Protocol) {
        super();
        this.#protocol = protocol;

        this.onMediaControl = this.onMediaControl.bind(this);
        this.onSystemStatus = this.onSystemStatus.bind(this);
        this.onTVSystemStatus = this.onTVSystemStatus.bind(this);
        this.onNowPlayingInfo = this.onNowPlayingInfo.bind(this);
        this.onSupportedActions = this.onSupportedActions.bind(this);
        this.onTextInputStarted = this.onTextInputStarted.bind(this);
        this.onTextInputStopped = this.onTextInputStopped.bind(this);
    }

    /** Subscribes to protocol stream events and registers interests for push notifications. */
    subscribe(): void {
        const stream = this.#protocol.stream;

        stream.on('_iMC', this.onMediaControl);
        stream.on('SystemStatus', this.onSystemStatus);
        stream.on('TVSystemStatus', this.onTVSystemStatus);
        stream.on('NowPlayingInfo', this.onNowPlayingInfo);
        stream.on('SupportedActions', this.onSupportedActions);
        stream.on('_tiStarted', this.onTextInputStarted);
        stream.on('_tiStopped', this.onTextInputStopped);

        // Register interests individually (like Apple does).
        this.#protocol.registerInterests(['_iMC']);
        this.#protocol.registerInterests(['SystemStatus']);
        this.#protocol.registerInterests(['TVSystemStatus']);
        this.#protocol.registerInterests(['NowPlayingInfo']);
        this.#protocol.registerInterests(['SupportedActions']);
    }

    /** Unsubscribes from protocol stream events and deregisters interests. */
    unsubscribe(): void {
        const stream = this.#protocol.stream;

        if (!stream.isConnected) {
            return;
        }

        stream.off('_iMC', this.onMediaControl);
        stream.off('SystemStatus', this.onSystemStatus);
        stream.off('TVSystemStatus', this.onTVSystemStatus);
        stream.off('NowPlayingInfo', this.onNowPlayingInfo);
        stream.off('SupportedActions', this.onSupportedActions);
        stream.off('_tiStarted', this.onTextInputStarted);
        stream.off('_tiStopped', this.onTextInputStopped);

        try {
            this.#protocol.deregisterInterests(['_iMC']);
            this.#protocol.deregisterInterests(['SystemStatus']);
            this.#protocol.deregisterInterests(['TVSystemStatus']);
            this.#protocol.deregisterInterests(['NowPlayingInfo']);
            this.#protocol.deregisterInterests(['SupportedActions']);
        } catch {}
    }

    /** Fetches the initial attention state and media control status from the device. */
    async fetchInitialState(): Promise<void> {
        try {
            const state = await this.#protocol.getAttentionState();
            this.#attentionState = state;
            this.emit('attentionStateChanged', state);
        } catch (err) {
            this.#protocol.context.logger.warn('[cl-state]', 'Failed to fetch initial attention state', err);
        }

        try {
            await this.#protocol.fetchMediaControlStatus();
        } catch (err) {
            this.#protocol.context.logger.warn('[cl-state]', 'Failed to fetch media control status', err);
        }
    }

    /** Resets all state to initial/default values. */
    clear(): void {
        this.#attentionState = 'unknown';
        this.#mediaCapabilities = parseMediaControlFlags(0);
        this.#mediaControlFlags = 0;
        this.#nowPlayingInfo = null;
        this.#supportedActions = null;
        this.#textInputState = { ...DEFAULT_TEXT_INPUT };
        this.#volumeAvailable = false;
    }

    // --- Event handlers ---

    /**
     * Handles media control flag updates (_iMC). Parses the flags bitmask and
     * emits events if capabilities or volume availability changed.
     *
     * @param data - The raw media control payload.
     */
    onMediaControl(data: unknown): void {
        try {
            const payload = data as Record<string, unknown>;
            const flags = Number(payload?._mcF ?? 0);

            if (flags !== this.#mediaControlFlags) {
                this.#mediaControlFlags = flags;
                this.#mediaCapabilities = parseMediaControlFlags(flags);

                const wasVolumeAvailable = this.#volumeAvailable;
                this.#volumeAvailable = this.#mediaCapabilities.volume;

                this.emit('mediaControlFlagsChanged', flags, this.#mediaCapabilities);

                if (wasVolumeAvailable !== this.#volumeAvailable) {
                    this.emit('volumeAvailabilityChanged', this.#volumeAvailable);
                }
            }
        } catch (err) {
            this.#protocol.context.logger.error('[cl-state]', '_iMC parse error', err);
        }
    }

    /**
     * Handles SystemStatus events (attention state changes from non-TV devices).
     *
     * @param data - The raw system status payload containing a state code.
     */
    onSystemStatus(data: unknown): void {
        const payload = data as { state: number };
        const state = convertAttentionState(payload.state);

        if (state !== this.#attentionState) {
            this.#attentionState = state;
            this.emit('attentionStateChanged', state);
        }
    }

    /**
     * Handles TVSystemStatus events (attention state changes from Apple TV).
     *
     * @param data - The raw TV system status payload containing a state code.
     */
    onTVSystemStatus(data: unknown): void {
        const payload = data as { state: number };
        const state = convertAttentionState(payload.state);

        if (state !== this.#attentionState) {
            this.#attentionState = state;
            this.emit('attentionStateChanged', state);
        }
    }

    /**
     * Handles NowPlayingInfo updates. Decodes the NSKeyedArchiver plist payload
     * when present, otherwise uses the raw dictionary.
     *
     * @param data - The raw now-playing info payload.
     */
    onNowPlayingInfo(data: unknown): void {
        try {
            const payload = data as Record<string, unknown>;

            if (payload?.NowPlayingInfoKey) {
                const raw = payload.NowPlayingInfoKey;
                const buf = Buffer.from(raw as any);
                const plist = Plist.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer) as any;
                const decoded = NSKeyedArchiver.decode(plist);
                this.#nowPlayingInfo = (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) ? decoded as Record<string, unknown> : null;
            } else {
                this.#nowPlayingInfo = payload ?? null;
            }

            this.emit('nowPlayingInfoChanged', this.#nowPlayingInfo);
        } catch (err) {
            this.#protocol.context.logger.error('[cl-state]', 'NowPlayingInfo parse error', err);
        }
    }

    /**
     * Handles SupportedActions updates from the device.
     *
     * @param data - The raw supported actions payload.
     */
    onSupportedActions(data: unknown): void {
        try {
            const payload = data as Record<string, unknown>;
            this.#supportedActions = payload ?? null;
            this.emit('supportedActionsChanged', payload ?? {});
        } catch (err) {
            this.#protocol.context.logger.error('[cl-state]', 'SupportedActions parse error', err);
        }
    }

    /**
     * Handles the start of a text input session. Parses the plist payload to extract
     * document text, security mode, keyboard type, and autocorrection settings.
     *
     * @param data - The raw text input started payload.
     */
    onTextInputStarted(data: unknown): void {
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

            this.#textInputState = { isActive: true, documentText, isSecure, keyboardType, autocorrection, autocapitalization };
            this.emit('textInputChanged', this.#textInputState);
        } catch (err) {
            this.#protocol.context.logger.error('[cl-state]', 'Text input started parse error', err);
        }
    }

    /**
     * Handles the end of a text input session. Resets the text input state to defaults.
     *
     * @param _data - The raw text input stopped payload (unused).
     */
    onTextInputStopped(_data: unknown): void {
        this.#textInputState = { ...DEFAULT_TEXT_INPUT };
        this.emit('textInputChanged', this.#textInputState);
    }
}

/**
 * Parses a media control flags bitmask into a structured MediaCapabilities object.
 *
 * @param flags - The raw bitmask from the _iMC event.
 * @returns An object indicating which media controls are available.
 */
function parseMediaControlFlags(flags: number): MediaCapabilities {
    return {
        play: (flags & MediaControlFlag.Play) !== 0,
        pause: (flags & MediaControlFlag.Pause) !== 0,
        previousTrack: (flags & MediaControlFlag.PreviousTrack) !== 0,
        nextTrack: (flags & MediaControlFlag.NextTrack) !== 0,
        fastForward: (flags & MediaControlFlag.FastForward) !== 0,
        rewind: (flags & MediaControlFlag.Rewind) !== 0,
        volume: (flags & MediaControlFlag.Volume) !== 0,
        skipForward: (flags & MediaControlFlag.SkipForward) !== 0,
        skipBackward: (flags & MediaControlFlag.SkipBackward) !== 0
    };
}
