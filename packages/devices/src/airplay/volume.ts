import { AirPlay, DataStreamMessage, Proto } from '@basmilius/apple-airplay';
import { reporter } from '@basmilius/apple-common';
import { PROTOCOL } from './const';
import type Device from './device';
import type State from './state';

const VOLUME_STEP = 0.05; // 5%

export default class {
    get #airplay(): AirPlay {
        return this.#device[PROTOCOL];
    }

    get #state(): State {
        return this.#device.state;
    }

    readonly #device: Device;

    constructor(device: Device) {
        this.#device = device;
    }

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
                throw new Error('Volume control is not available.');
        }
    }

    async up(): Promise<void> {
        switch (this.#state.volumeCapabilities) {
            case Proto.VolumeCapabilities_Enum.Absolute:
            case Proto.VolumeCapabilities_Enum.Both:
                const newVolume = Math.max(0, this.#state.volume + VOLUME_STEP);
                await this.set(newVolume);
                break;

            case Proto.VolumeCapabilities_Enum.Relative:
                await this.#device.remote.volumeUp();
                break;

            default:
                throw new Error('Volume control is not available.');
        }
    }

    async get(): Promise<number> {
        if (!this.#state.outputDeviceUID) {
            throw new Error('No output device active.');
        }

        const response = await this.#airplay.dataStream.exchange(DataStreamMessage.getVolume(this.#state.outputDeviceUID));

        if (response.type === Proto.ProtocolMessage_Type.GET_VOLUME_RESULT_MESSAGE) {
            const message = DataStreamMessage.getExtension(response, Proto.getVolumeResultMessage);

            return message.volume;
        }

        throw new Error('Failed to get volume.');
    }

    async set(volume: number): Promise<void> {
        if (!this.#state.outputDeviceUID) {
            throw new Error('No output device active.');
        }

        if (![Proto.VolumeCapabilities_Enum.Absolute, Proto.VolumeCapabilities_Enum.Both].includes(this.#state.volumeCapabilities)) {
            throw new Error('Absolute volume control is not available.');
        }

        volume = Math.min(1, Math.max(0, volume));

        reporter.info(`Setting volume to ${volume} for device ${this.#state.outputDeviceUID}`);

        await this.#airplay.dataStream.exchange(DataStreamMessage.setVolume(this.#state.outputDeviceUID, volume));
    }
}
