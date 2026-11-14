import type { MediaRemote, MediaRemoteState } from '@corewire/airplay/mrp';
import { requireSession } from '../errors';

/** The multi-room group the device plays in. */
export class MultiroomControl {
    get clusterId(): string | null {
        return this.#state.clusterID;
    }

    get isClusterAware(): boolean {
        return this.#state.isClusterAware;
    }

    get isLeader(): boolean {
        return this.#state.isClusterLeader;
    }

    readonly #remote: () => MediaRemote | undefined;
    readonly #state: MediaRemoteState;

    constructor(state: MediaRemoteState, remote: () => MediaRemote | undefined) {
        this.#remote = remote;
        this.#state = state;
    }

    async add(...deviceUids: string[]): Promise<void> {
        await requireSession(this.#remote(), 'multiroom').outputDevices.add(deviceUids);
    }

    async remove(...deviceUids: string[]): Promise<void> {
        await requireSession(this.#remote(), 'multiroom').outputDevices.remove(deviceUids);
    }

    /** Replaces the whole group. */
    async set(...deviceUids: string[]): Promise<void> {
        await requireSession(this.#remote(), 'multiroom').outputDevices.set(deviceUids);
    }
}
