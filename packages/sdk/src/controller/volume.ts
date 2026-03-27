import type { Proto } from '@basmilius/apple-airplay';
import type { AirPlayManager } from '../internal';

/**
 * Volume controller for Apple devices.
 * Supports absolute volume (set level), relative volume (up/down),
 * muting, fading, and per-device volume in multi-room setups.
 */
export class VolumeController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    async set(volume: number): Promise<void> {
        await this.#airplay.volume.set(volume);
    }

    async get(): Promise<number> {
        return await this.#airplay.volume.get();
    }

    async up(): Promise<void> {
        await this.#airplay.volume.up();
    }

    async down(): Promise<void> {
        await this.#airplay.volume.down();
    }

    async mute(): Promise<void> {
        await this.#airplay.volume.mute();
    }

    async unmute(): Promise<void> {
        await this.#airplay.volume.unmute();
    }

    async toggleMute(): Promise<void> {
        await this.#airplay.volume.toggleMute();
    }

    async fade(targetVolume: number, durationMs: number): Promise<void> {
        await this.#airplay.volume.fade(targetVolume, durationMs);
    }

    async setForDevice(outputDeviceUID: string, volume: number): Promise<void> {
        await this.#airplay.volume.setForDevice(outputDeviceUID, volume);
    }

    async getForDevice(outputDeviceUID: string): Promise<number> {
        return await this.#airplay.volume.getForDevice(outputDeviceUID);
    }

    async muteDevice(outputDeviceUID: string): Promise<void> {
        await this.#airplay.volume.muteDevice(outputDeviceUID);
    }

    async unmuteDevice(outputDeviceUID: string): Promise<void> {
        await this.#airplay.volume.unmuteDevice(outputDeviceUID);
    }

    async adjust(adjustment: Proto.AdjustVolumeMessage_Adjustment, outputDeviceUID?: string): Promise<void> {
        await this.#airplay.volume.adjust(adjustment, outputDeviceUID);
    }
}
