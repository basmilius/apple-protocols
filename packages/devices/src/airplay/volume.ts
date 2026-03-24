import { DataStreamMessage, Proto, type Protocol } from '@basmilius/apple-airplay';
import { CommandError } from '@basmilius/apple-common';
import { PROTOCOL } from './const';
import type Device from './device';
import type State from './state';

/** Volume adjustment step size as a fraction (0.05 = 5%). */
const VOLUME_STEP = 0.05; // 5%

/**
 * Smart volume controller for an AirPlay device.
 * Automatically chooses between absolute volume (set a specific level) and
 * relative volume (HID volume up/down keys) based on the device's reported capabilities.
 */
export default class {
    /** @returns The underlying AirPlay Protocol instance. */
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    /** @returns The AirPlay state for volume and capability information. */
    get #state(): State {
        return this.#device.state;
    }

    readonly #device: Device;

    /**
     * Creates a new Volume controller.
     *
     * @param device - The AirPlay device to control volume for.
     */
    constructor(device: Device) {
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
}
