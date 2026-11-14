import { EventEmitter } from 'node:events';
import { NSKeyedArchiver, Plist, RTI } from '@corewire/core/encoding';
import { MediaControlFlag } from './const';
import type { AttentionState, MediaCapabilities, TextInputState } from './types';
import { convertAttentionState } from './utils';

export type CompanionLinkStateEventMap = {
    readonly attentionStateChanged: [AttentionState];
    readonly mediaControlFlagsChanged: [flags: number, capabilities: MediaCapabilities];
    readonly nowPlayingInfoChanged: [info: Record<string, unknown> | null];
    readonly supportedActionsChanged: [actions: Record<string, unknown>];
    readonly textInputChanged: [TextInputState];
    readonly volumeAvailabilityChanged: [available: boolean];
};

/** The events the state derives something from; a session registers interest in the first five. */
export const STATE_EVENTS: readonly string[] = ['_iMC', 'SystemStatus', 'TVSystemStatus', 'NowPlayingInfo', 'SupportedActions', '_tiStarted', '_tiStopped'];

const DEFAULT_TEXT_INPUT: TextInputState = {
    isActive: false,
    documentText: '',
    isSecure: false,
    keyboardType: 0,
    autocorrection: false,
    autocapitalization: false
};

/**
 * What a Companion Link device reports about itself: attention state, media controls, now playing,
 * supported actions and text input. A model without I/O: feed it with {@link apply}, from a session
 * or from recorded events.
 */
export class CompanionLinkState extends EventEmitter<CompanionLinkStateEventMap> {
    get attentionState(): AttentionState {
        return this.#attentionState;
    }

    get mediaCapabilities(): MediaCapabilities {
        return this.#mediaCapabilities;
    }

    /** The raw `_iMC` bitmask, see {@link MediaControlFlag}. */
    get mediaControlFlags(): number {
        return this.#mediaControlFlags;
    }

    get nowPlayingInfo(): Record<string, unknown> | null {
        return this.#nowPlayingInfo;
    }

    get supportedActions(): Record<string, unknown> | null {
        return this.#supportedActions;
    }

    get textInputState(): TextInputState {
        return this.#textInputState;
    }

    get volumeAvailable(): boolean {
        return this.#volumeAvailable;
    }

    #attentionState: AttentionState;
    #mediaCapabilities: MediaCapabilities;
    #mediaControlFlags: number;
    #nowPlayingInfo: Record<string, unknown> | null;
    #supportedActions: Record<string, unknown> | null;
    #textInputState: TextInputState;
    #volumeAvailable: boolean;

    constructor() {
        super();

        this.clear();
    }

    /**
     * Applies the `_c` of one event. Events the state does not track are ignored.
     * `FetchAttentionState` takes the content of that reply and always emits, also when the state
     * did not change, so a fresh session reports its attention state once.
     *
     * @throws When the content is malformed; text input falls back to its default state first.
     */
    apply(name: string, content: unknown): void {
        switch (name) {
            case '_iMC':
                return this.#onMediaControl(content as Record<string, unknown>);
            case 'SystemStatus':
            case 'TVSystemStatus':
                return this.#onSystemStatus(content);
            case 'NowPlayingInfo':
                return this.#onNowPlayingInfo(content as Record<string, unknown>);
            case 'SupportedActions':
                return this.#onSupportedActions(content as Record<string, unknown>);
            case '_tiStarted':
                return this.#onTextInputStarted(content as {readonly _tiD?: Uint8Array});
            case '_tiStopped':
                return this.#onTextInputStopped();
            case 'FetchAttentionState':
                return this.#onAttentionStateFetched(content as {readonly state: number});
        }
    }

    /** Resets every value to its initial one, without events. */
    clear(): void {
        this.#attentionState = 'unknown';
        this.#mediaCapabilities = parseMediaControlFlags(0);
        this.#mediaControlFlags = 0;
        this.#nowPlayingInfo = null;
        this.#supportedActions = null;
        this.#textInputState = {...DEFAULT_TEXT_INPUT};
        this.#volumeAvailable = false;
    }

    #onAttentionStateFetched(content: {readonly state: number}): void {
        const state = convertAttentionState(content.state);

        this.#attentionState = state;
        this.emit('attentionStateChanged', state);
    }

    /** Emits only when the flags change, and the volume event only when the volume bit flips. */
    #onMediaControl(content: Record<string, unknown>): void {
        const flags = Number(content?._mcF ?? 0);

        if (flags === this.#mediaControlFlags) {
            return;
        }

        this.#mediaControlFlags = flags;
        this.#mediaCapabilities = parseMediaControlFlags(flags);

        const wasVolumeAvailable = this.#volumeAvailable;
        this.#volumeAvailable = this.#mediaCapabilities.volume;

        this.emit('mediaControlFlagsChanged', flags, this.#mediaCapabilities);

        if (wasVolumeAvailable !== this.#volumeAvailable) {
            this.emit('volumeAvailabilityChanged', this.#volumeAvailable);
        }
    }

    /** The NSKeyedArchiver plist in `NowPlayingInfoKey` when present, otherwise the dictionary itself. */
    #onNowPlayingInfo(content: Record<string, unknown>): void {
        if (content?.NowPlayingInfoKey) {
            const bytes = Buffer.from(content.NowPlayingInfoKey as Uint8Array);
            const plist = Plist.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) as any;
            const decoded = NSKeyedArchiver.decode(plist);

            this.#nowPlayingInfo = (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) ? decoded as Record<string, unknown> : null;
        } else {
            this.#nowPlayingInfo = content ?? null;
        }

        this.emit('nowPlayingInfoChanged', this.#nowPlayingInfo);
    }

    #onSupportedActions(content: Record<string, unknown>): void {
        this.#supportedActions = content ?? null;
        this.emit('supportedActionsChanged', content ?? {});
    }

    /** Only the states 1 to 4 count, as a number or a numeric string; a repeat emits nothing. */
    #onSystemStatus(content: unknown): void {
        const value = (content as {state?: unknown} | null)?.state;

        if (typeof value !== 'number' && !(typeof value === 'string' && /^[1-4]$/.test(value))) {
            return;
        }

        const state = convertAttentionState(Number(value));

        if (state === 'unknown' || state === this.#attentionState) {
            return;
        }

        this.#attentionState = state;
        this.emit('attentionStateChanged', state);
    }

    #onTextInputStarted(content: {readonly _tiD?: Uint8Array}): void {
        try {
            if (!content?._tiD) {
                this.#textInputState = {...DEFAULT_TEXT_INPUT};
            } else {
                const {uuid, ...state} = RTI.decodeSession(content._tiD);
                this.#textInputState = {isActive: true, ...state};
            }

            this.emit('textInputChanged', this.#textInputState);
        } catch (err) {
            this.#textInputState = {...DEFAULT_TEXT_INPUT};
            this.emit('textInputChanged', this.#textInputState);

            throw err;
        }
    }

    #onTextInputStopped(): void {
        this.#textInputState = {...DEFAULT_TEXT_INPUT};
        this.emit('textInputChanged', this.#textInputState);
    }
}

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
