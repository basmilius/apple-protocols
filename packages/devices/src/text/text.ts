import { EventEmitter } from 'node:events';
import type { MediaRemote, MediaRemoteState } from '@apple-protocols/airplay/mrp';
import type { CompanionLinkSession, CompanionLinkState, TextInputState } from '@apple-protocols/companion-link';
import { UnavailableError } from '../errors';
import type { TextState } from '../types';

export type TextEventMap = {
    change: [state: TextState];
};

function fromCompanionLink(state: TextInputState): TextState {
    return {
        active: state.isActive,
        text: state.documentText,
        secure: state.isSecure,
        keyboardType: state.keyboardType,
        autocorrection: state.autocorrection,
        autocapitalization: state.autocapitalization
    };
}

function fromMediaRemote(state: MediaRemoteState): TextState {
    const traits = state.keyboardAttributes?.inputTraits;

    return {
        active: state.isKeyboardActive,
        text: '',
        secure: traits?.secureTextEntry ?? false,
        keyboardType: traits?.keyboardType ?? 0,
        autocorrection: traits?.autocorrection ?? false,
        autocapitalization: (traits?.autocapitalizationType ?? 0) !== 0
    };
}

/**
 * Text input on the focused field. Companion Link goes first; without it the text goes through the
 * AirPlay RTI session. The state follows the same protocol.
 */
export interface TextControl extends EventEmitter<TextEventMap> {
    readonly state: TextState;

    /** Replaces the text of the focused field. */
    set(text: string): Promise<void>;

    append(text: string): Promise<void>;
    clear(): Promise<void>;
}

export class TextController extends EventEmitter<TextEventMap> implements TextControl {
    get state(): TextState {
        return this.#companionLink()
            ? fromCompanionLink(this.#companionLinkState.textInputState)
            : fromMediaRemote(this.#mediaRemoteState);
    }

    readonly #companionLink: () => CompanionLinkSession | undefined;
    readonly #companionLinkState: CompanionLinkState;
    readonly #mediaRemoteState: MediaRemoteState;
    readonly #remote: () => MediaRemote | undefined;

    constructor(mediaRemoteState: MediaRemoteState, remote: () => MediaRemote | undefined, companionLinkState: CompanionLinkState, companionLink: () => CompanionLinkSession | undefined) {
        super();

        this.#companionLink = companionLink;
        this.#companionLinkState = companionLinkState;
        this.#mediaRemoteState = mediaRemoteState;
        this.#remote = remote;

        companionLinkState.on('textInputChanged', state => this.emit('change', fromCompanionLink(state)));
        mediaRemoteState.on('keyboardChanged', () => {
            if (!this.#companionLink()) {
                this.emit('change', fromMediaRemote(mediaRemoteState));
            }
        });
    }

    /** Replaces the text of the focused field. */
    async set(text: string): Promise<void> {
        const companionLink = this.#companionLink();

        if (companionLink) {
            await companionLink.text.set(text);
        } else {
            await this.#keyboard().set(text);
        }
    }

    async append(text: string): Promise<void> {
        const companionLink = this.#companionLink();

        if (companionLink) {
            await companionLink.text.append(text);
        } else {
            await this.#keyboard().append(text);
        }
    }

    async clear(): Promise<void> {
        const companionLink = this.#companionLink();

        if (companionLink) {
            await companionLink.text.clear();
        } else {
            await this.#keyboard().clear();
        }
    }

    #keyboard(): MediaRemote['keyboard'] {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('text', 'disconnected');
        }

        return remote.keyboard;
    }
}
