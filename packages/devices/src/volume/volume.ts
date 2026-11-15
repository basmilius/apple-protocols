import { EventEmitter } from 'node:events';
import { type MediaRemote, type MediaRemoteState, Proto } from '@corewire/airplay/mrp';
import { UnavailableError } from '../errors';
import type { VolumeMode, VolumeState } from '../types';

export type VolumeEventMap = {
    change: [volume: VolumeState];
};

const INITIAL: VolumeState = {level: 0, muted: false, available: false, mode: 'none'};

function modeOf(capabilities: Proto.VolumeCapabilities_Enum): VolumeMode {
    switch (capabilities) {
        case Proto.VolumeCapabilities_Enum.Absolute:
        case Proto.VolumeCapabilities_Enum.Both:
            return 'absolute';

        case Proto.VolumeCapabilities_Enum.Relative:
            return 'relative';

        default:
            return 'none';
    }
}

/**
 * The volume of the output device, 0 to 1. The values outlive the sessions and `change` only fires
 * when one of them differs from what it announced last, so a reconnect that reports the same
 * volume emits nothing.
 */
export interface VolumeControl extends EventEmitter<VolumeEventMap>, VolumeState {
    /** Sets the volume, clamped to 0 to 1. It needs mode `absolute`. */
    set(level: number): Promise<void>;

    /** Raises the volume by a 0.05 step in mode `absolute`, or presses the volume key in mode `relative`. */
    up(): Promise<void>;

    down(): Promise<void>;
    mute(): Promise<void>;
    unmute(): Promise<void>;
    toggleMute(): Promise<void>;
    fade(level: number, durationMs: number): Promise<void>;
}

export class VolumeController extends EventEmitter<VolumeEventMap> implements VolumeControl {
    get available(): boolean {
        return this.#volume.available;
    }

    get level(): number {
        return this.#volume.level;
    }

    get mode(): VolumeMode {
        return this.#volume.mode;
    }

    get muted(): boolean {
        return this.#volume.muted;
    }

    readonly #remote: () => MediaRemote | undefined;
    #volume: VolumeState = INITIAL;

    constructor(state: MediaRemoteState, remote: () => MediaRemote | undefined) {
        super();

        this.#remote = remote;

        state.on('volumeChanged', level => this.#update({level}));
        state.on('volumeMutedChanged', muted => this.#update({muted}));
        state.on('volumeControlChanged', (available, capabilities) => this.#update({available, mode: modeOf(capabilities)}));
    }

    /** Sets the volume, clamped to 0 to 1. It needs mode `absolute`. */
    async set(level: number): Promise<void> {
        await this.#require().set(level);
    }

    /** Raises the volume by a 0.05 step in mode `absolute`, or presses the volume key in mode `relative`. */
    async up(): Promise<void> {
        await this.#require().up();
    }

    async down(): Promise<void> {
        await this.#require().down();
    }

    async mute(): Promise<void> {
        await this.#require().mute();
    }

    async unmute(): Promise<void> {
        await this.#require().unmute();
    }

    async toggleMute(): Promise<void> {
        await this.#require().toggleMute();
    }

    async fade(level: number, durationMs: number): Promise<void> {
        await this.#require().fade(level, durationMs);
    }

    /**
     * Forgets the announced values, so the next session announces them as a new device would.
     * A disconnect calls it once the sessions closed; a drop keeps the values.
     */
    reset(): void {
        this.#volume = INITIAL;
    }

    #require(): MediaRemote['volume'] {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('volume', 'disconnected');
        }

        return remote.volume;
    }

    #update(change: Partial<VolumeState>): void {
        const next = {...this.#volume, ...change};
        const current = this.#volume;

        if (next.level === current.level && next.muted === current.muted && next.available === current.available && next.mode === current.mode) {
            return;
        }

        this.#volume = next;
        this.emit('change', next);
    }
}
