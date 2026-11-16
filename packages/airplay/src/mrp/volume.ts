import { CommandError, waitFor } from '@apple-protocols/core';
import type { Context } from '@apple-protocols/core/transport';
import type { DataChannel } from '../channels/data';
import type { Hid } from './hid';
import * as Messages from './messages';
import * as Proto from './proto';
import type { MediaRemoteState } from './state';

/** One step of {@link Volume.up} and {@link Volume.down} on the 0 to 1 scale. */
const VOLUME_STEP = 0.05;

/** Time between the steps of a fade, in milliseconds. */
const FADE_STEP_INTERVAL = 50;

/**
 * Volume of the receiver on a 0 to 1 scale. Absolute volume goes to the output device the state
 * names; a receiver that only supports relative volume gets the HID volume keys instead.
 */
export class Volume {
    readonly #channel: DataChannel;
    readonly #context: Context;
    readonly #hid: Hid;
    readonly #state: MediaRemoteState;

    constructor(channel: DataChannel, context: Context, state: MediaRemoteState, hid: Hid) {
        this.#channel = channel;
        this.#context = context;
        this.#hid = hid;
        this.#state = state;
    }

    /** @throws {CommandError} When the receiver has no volume control. */
    async down(): Promise<void> {
        switch (this.#state.volumeCapabilities) {
            case Proto.VolumeCapabilities_Enum.Absolute:
            case Proto.VolumeCapabilities_Enum.Both:
                await this.set(Math.max(0, this.#state.volume - VOLUME_STEP));
                break;

            case Proto.VolumeCapabilities_Enum.Relative:
                await this.#hid.volumeDown();
                break;

            default:
                throw new CommandError('Volume control is not available.');
        }
    }

    /** @throws {CommandError} When the receiver has no volume control. */
    async up(): Promise<void> {
        switch (this.#state.volumeCapabilities) {
            case Proto.VolumeCapabilities_Enum.Absolute:
            case Proto.VolumeCapabilities_Enum.Both:
                await this.set(Math.min(1, Math.max(0, this.#state.volume + VOLUME_STEP)));
                break;

            case Proto.VolumeCapabilities_Enum.Relative:
                await this.#hid.volumeUp();
                break;

            default:
                throw new CommandError('Volume control is not available.');
        }
    }

    /** @throws {CommandError} When no output device is active or the receiver answers otherwise. */
    async get(): Promise<number> {
        return await this.#getVolume(this.#requireOutputDevice(), 'Failed to get volume.');
    }

    /**
     * Sets an absolute volume, clamped to 0 to 1.
     *
     * @throws {CommandError} When no output device is active or absolute volume is not available.
     */
    async set(volume: number): Promise<void> {
        const outputDeviceUID = this.#requireOutputDevice();

        this.#requireAbsolute();

        volume = Math.min(1, Math.max(0, volume));

        this.#context.logger.info(`Setting volume to ${volume} for device ${outputDeviceUID}`);

        await this.#channel.exchange(Messages.setVolume(outputDeviceUID, volume));
    }

    /** @throws {CommandError} When no output device is active. */
    async mute(): Promise<void> {
        await this.#channel.exchange(Messages.setVolumeMuted(this.#requireOutputDevice(), true));
    }

    /** @throws {CommandError} When no output device is active. */
    async unmute(): Promise<void> {
        await this.#channel.exchange(Messages.setVolumeMuted(this.#requireOutputDevice(), false));
    }

    /** @throws {CommandError} When no output device is active. */
    async toggleMute(): Promise<void> {
        if (this.#state.volumeMuted) {
            await this.unmute();
        } else {
            await this.mute();
        }
    }

    /** Sets the volume of one output device in a group, clamped to 0 to 1. */
    async setForDevice(outputDeviceUID: string, volume: number): Promise<void> {
        volume = Math.min(1, Math.max(0, volume));

        this.#context.logger.info(`Setting volume to ${volume} for output device ${outputDeviceUID}`);

        await this.#channel.exchange(Messages.setVolume(outputDeviceUID, volume));
    }

    /** @throws {CommandError} When the receiver answers otherwise. */
    async getForDevice(outputDeviceUID: string): Promise<number> {
        return await this.#getVolume(outputDeviceUID, 'Failed to get volume for output device.');
    }

    async muteDevice(outputDeviceUID: string): Promise<void> {
        await this.#channel.exchange(Messages.setVolumeMuted(outputDeviceUID, true));
    }

    async unmuteDevice(outputDeviceUID: string): Promise<void> {
        await this.#channel.exchange(Messages.setVolumeMuted(outputDeviceUID, false));
    }

    /**
     * Steps the volume of an output device up or down by a small, medium or large amount.
     *
     * @param outputDeviceUID - The active output device when omitted.
     * @throws {CommandError} When no output device is given or active.
     */
    async adjust(adjustment: Proto.AdjustVolumeMessage_Adjustment, outputDeviceUID?: string): Promise<void> {
        const uid = outputDeviceUID ?? this.#state.outputDeviceUID;

        if (!uid) {
            throw new CommandError('No output device active.');
        }

        await this.#channel.exchange(Messages.adjustVolume(adjustment, uid));
    }

    /** Asks the receiver to fade its audio: 0 fades out, 1 fades in. */
    async audioFade(fadeType: number): Promise<void> {
        this.#channel.send(Messages.audioFade(fadeType));
    }

    /**
     * Fades to a volume in steps of {@link FADE_STEP_INTERVAL} ms; the last step sets the target exactly.
     *
     * @param durationMs - Duration of the fade in milliseconds.
     * @throws {CommandError} When no output device is active or absolute volume is not available.
     */
    async fade(targetVolume: number, durationMs: number): Promise<void> {
        this.#requireOutputDevice();
        this.#requireAbsolute();

        targetVolume = Math.min(1, Math.max(0, targetVolume));

        const startVolume = this.#state.volume;
        const steps = Math.max(1, Math.floor(durationMs / FADE_STEP_INTERVAL));
        const stepDuration = durationMs / steps;
        const volumeDelta = (targetVolume - startVolume) / steps;

        for (let i = 1; i <= steps; i++) {
            const volume = i === steps
                ? targetVolume
                : Math.min(1, Math.max(0, startVolume + volumeDelta * i));

            await this.set(volume);

            if (i < steps) {
                await waitFor(stepDuration);
            }
        }
    }

    async #getVolume(outputDeviceUID: string, failure: string): Promise<number> {
        const response = await this.#channel.exchange(Messages.getVolume(outputDeviceUID));

        if (response.type === Proto.ProtocolMessage_Type.GET_VOLUME_RESULT_MESSAGE) {
            return Messages.getExtension(response, Proto.getVolumeResultMessage).volume;
        }

        throw new CommandError(failure);
    }

    #requireAbsolute(): void {
        if (![Proto.VolumeCapabilities_Enum.Absolute, Proto.VolumeCapabilities_Enum.Both].includes(this.#state.volumeCapabilities)) {
            throw new CommandError('Absolute volume control is not available.');
        }
    }

    #requireOutputDevice(): string {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (!outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        return outputDeviceUID;
    }
}
