import type { AirPlayManager } from '../internal/airplay-manager';

/**
 * Multi-room / cluster controller for Apple devices.
 * Manages output device groups for multi-room audio.
 */
export class MultiroomController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    /** The cluster ID if the device is part of a multi-room group, or null. */
    get clusterId(): string | null {
        return this.#airplay.state.clusterID;
    }

    /** Whether this device is the leader of its multi-room cluster. */
    get isLeader(): boolean {
        return this.#airplay.state.isClusterLeader;
    }

    /** Whether this device is aware of cluster functionality. */
    get isClusterAware(): boolean {
        return this.#airplay.state.isClusterAware;
    }

    /**
     * Adds devices to the current multi-room output context.
     *
     * @param deviceUIDs - UIDs of devices to add.
     */
    async addDevice(...deviceUIDs: string[]): Promise<void> {
        await this.#airplay.addOutputDevices(deviceUIDs);
    }

    /**
     * Removes devices from the current multi-room output context.
     *
     * @param deviceUIDs - UIDs of devices to remove.
     */
    async removeDevice(...deviceUIDs: string[]): Promise<void> {
        await this.#airplay.removeOutputDevices(deviceUIDs);
    }

    /**
     * Replaces the entire multi-room output context.
     *
     * @param deviceUIDs - UIDs of devices to set as the output context.
     */
    async setDevices(...deviceUIDs: string[]): Promise<void> {
        await this.#airplay.setOutputDevices(deviceUIDs);
    }
}
