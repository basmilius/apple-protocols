import { DataStreamMessage, Proto, type Protocol } from '@basmilius/apple-airplay';
import { CommandError, waitFor } from '@basmilius/apple-common';
import { PROTOCOL } from './const';
import type { AirPlayManager } from './airplay-manager';
import type { AirPlayState } from './airplay-state';

/** Volume adjustment step size as a fraction (0.05 = 5%). */
const VOLUME_STEP = 0.05; // 5%

/** Minimum interval between volume fade steps in milliseconds. */
const FADE_STEP_INTERVAL = 50;

/**
 * Smart volume controller for an AirPlay device.
 * Automatically chooses between absolute volume (set a specific level) and
 * relative volume (HID volume up/down keys) based on the device's reported capabilities.
 */
export class AirPlayVolume {
    /** @returns The underlying AirPlay Protocol instance. */
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    /** @returns The AirPlay state for volume and capability information. */
    get #state(): AirPlayState {
        return this.#device.state;
    }

    readonly #device: AirPlayManager;

    /**
     * Creates a new Volume controller.
     *
     * @param device - The AirPlay device to control volume for.
     */
    constructor(device: AirPlayManager) {
        this.#device = device;
    }

    /**
     * Decreases the volume by one step. Uses absolute volume when available,
     * falls back to HID relative volume keys otherwise.
     *
     * @throws CommandError when volume control is not available.
     */
    async down(): Promise<void> {
        switch (this.#state.volumeCapabilities) {
            case Proto.VolumeCapabilities_Enum.Absolute:
            case Proto.VolumeCapabilities_Enum.Both:
                const newVolume = Math.max(0, this.#state.volume - VOLUME_STEP);
                await this.set(newVolume);
                break;

            case Proto.VolumeCapabilities_Enum.Relative:
                await this.#device.remote.volumeDown();
                break;

            default:
                throw new CommandError('Volume control is not available.');
        }
    }

    /**
     * Increases the volume by one step. Uses absolute volume when available,
     * falls back to HID relative volume keys otherwise.
     *
     * @throws CommandError when volume control is not available.
     */
    async up(): Promise<void> {
        switch (this.#state.volumeCapabilities) {
            case Proto.VolumeCapabilities_Enum.Absolute:
            case Proto.VolumeCapabilities_Enum.Both:
                const newVolume = Math.min(1, Math.max(0, this.#state.volume + VOLUME_STEP));
                await this.set(newVolume);
                break;

            case Proto.VolumeCapabilities_Enum.Relative:
                await this.#device.remote.volumeUp();
                break;

            default:
                throw new CommandError('Volume control is not available.');
        }
    }

    /**
     * Fetches the current volume level from the device.
     *
     * @returns The volume level as a float between 0.0 and 1.0.
     * @throws CommandError when no output device is active or the request fails.
     */
    async get(): Promise<number> {
        if (!this.#state.outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        const response = await this.#protocol.dataStream.exchange(DataStreamMessage.getVolume(this.#state.outputDeviceUID));

        if (response.type === Proto.ProtocolMessage_Type.GET_VOLUME_RESULT_MESSAGE) {
            const message = DataStreamMessage.getExtension(response, Proto.getVolumeResultMessage);

            return message.volume;
        }

        throw new CommandError('Failed to get volume.');
    }

    /**
     * Sets the volume to an absolute level.
     *
     * @param volume - The desired volume level (clamped to 0.0 - 1.0).
     * @throws CommandError when no output device is active or absolute volume is not supported.
     */
    async set(volume: number): Promise<void> {
        if (!this.#state.outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        if (![Proto.VolumeCapabilities_Enum.Absolute, Proto.VolumeCapabilities_Enum.Both].includes(this.#state.volumeCapabilities)) {
            throw new CommandError('Absolute volume control is not available.');
        }

        volume = Math.min(1, Math.max(0, volume));

        this.#protocol.context.logger.info(`Setting volume to ${volume} for device ${this.#state.outputDeviceUID}`);

        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolume(this.#state.outputDeviceUID, volume));
    }

    /**
     * Mutes the output device.
     *
     * @throws CommandError when no output device is active.
     */
    async mute(): Promise<void> {
        if (!this.#state.outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolumeMuted(this.#state.outputDeviceUID, true));
    }

    /**
     * Unmutes the output device.
     *
     * @throws CommandError when no output device is active.
     */
    async unmute(): Promise<void> {
        if (!this.#state.outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolumeMuted(this.#state.outputDeviceUID, false));
    }

    /**
     * Toggles the mute state of the output device.
     *
     * @throws CommandError when no output device is active.
     */
    async toggleMute(): Promise<void> {
        if (this.#state.volumeMuted) {
            await this.unmute();
        } else {
            await this.mute();
        }
    }

    /**
     * Sets the volume for a specific output device in a speaker group.
     * Use this to control individual speakers when multiple devices are grouped.
     *
     * @param outputDeviceUID - The unique identifier of the target output device.
     * @param volume - The desired volume level (clamped to 0.0 - 1.0).
     */
    async setForDevice(outputDeviceUID: string, volume: number): Promise<void> {
        volume = Math.min(1, Math.max(0, volume));

        this.#protocol.context.logger.info(`Setting volume to ${volume} for output device ${outputDeviceUID}`);

        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolume(outputDeviceUID, volume));
    }

    /**
     * Fetches the volume for a specific output device in a speaker group.
     *
     * @param outputDeviceUID - The unique identifier of the target output device.
     * @returns The volume level as a float between 0.0 and 1.0.
     */
    async getForDevice(outputDeviceUID: string): Promise<number> {
        const response = await this.#protocol.dataStream.exchange(DataStreamMessage.getVolume(outputDeviceUID));

        if (response.type === Proto.ProtocolMessage_Type.GET_VOLUME_RESULT_MESSAGE) {
            const message = DataStreamMessage.getExtension(response, Proto.getVolumeResultMessage);

            return message.volume;
        }

        throw new CommandError('Failed to get volume for output device.');
    }

    /**
     * Mutes a specific output device in a speaker group.
     *
     * @param outputDeviceUID - The unique identifier of the target output device.
     */
    async muteDevice(outputDeviceUID: string): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolumeMuted(outputDeviceUID, true));
    }

    /**
     * Unmutes a specific output device in a speaker group.
     *
     * @param outputDeviceUID - The unique identifier of the target output device.
     */
    async unmuteDevice(outputDeviceUID: string): Promise<void> {
        await this.#protocol.dataStream.exchange(DataStreamMessage.setVolumeMuted(outputDeviceUID, false));
    }

    /**
     * Adjusts the volume by a relative increment/decrement on a specific output device.
     * This is the method Apple uses internally in Music.app for volume changes.
     *
     * @param adjustment - The volume adjustment to apply (IncrementSmall/Medium/Large, DecrementSmall/Medium/Large).
     * @param outputDeviceUID - Optional UID of the target output device. Defaults to the active device.
     */
    async adjust(adjustment: Proto.AdjustVolumeMessage_Adjustment, outputDeviceUID?: string): Promise<void> {
        const uid = outputDeviceUID ?? this.#state.outputDeviceUID;

        if (!uid) {
            throw new CommandError('No output device active.');
        }

        await this.#protocol.dataStream.exchange(DataStreamMessage.adjustVolume(adjustment, uid));
    }

    /**
     * Smoothly fades the volume to a target level over a given duration.
     * Uses linear interpolation with absolute volume set calls.
     *
     * @param targetVolume - The target volume level (0.0 - 1.0).
     * @param durationMs - The fade duration in milliseconds.
     * @throws CommandError when absolute volume control is not available.
     */
    async fade(targetVolume: number, durationMs: number): Promise<void> {
        if (!this.#state.outputDeviceUID) {
            throw new CommandError('No output device active.');
        }

        if (![Proto.VolumeCapabilities_Enum.Absolute, Proto.VolumeCapabilities_Enum.Both].includes(this.#state.volumeCapabilities)) {
            throw new CommandError('Absolute volume control is not available.');
        }

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
}
