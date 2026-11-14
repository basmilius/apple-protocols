import { EventEmitter } from 'node:events';
import type { MediaRemote, MediaRemoteState, Proto } from '@corewire/airplay/mrp';
import { requireSession } from '../errors';
import type { OutputDevice } from '../types';

export type MultiroomEventMap = {
    /** The output devices differ from the last list this object announced. */
    change: [outputs: readonly OutputDevice[]];
};

/**
 * The multi-room group the device plays in, and the volume of each output device in it. `outputs`
 * outlives the sessions like the volume does: a reconnect that reports the same devices emits
 * nothing.
 */
export interface MultiroomControl extends EventEmitter<MultiroomEventMap> {
    readonly clusterId: string | null;
    readonly isClusterAware: boolean;
    readonly isLeader: boolean;

    /** The output devices that play along now, as the device last reported them. */
    readonly outputs: readonly OutputDevice[];

    /** Adds output devices to the group by {@link OutputDevice.uid}. */
    add(...deviceUids: string[]): Promise<void>;

    remove(...deviceUids: string[]): Promise<void>;

    /** Replaces the whole group. */
    set(...deviceUids: string[]): Promise<void>;

    /** The volume of one output device, 0 to 1. */
    getVolume(deviceUid: string): Promise<number>;

    /** Sets the volume of one output device, clamped to 0 to 1. */
    setVolume(deviceUid: string, level: number): Promise<void>;

    mute(deviceUid: string): Promise<void>;
    unmute(deviceUid: string): Promise<void>;
}

function toOutputDevice(descriptor: Proto.AVOutputDeviceDescriptor): OutputDevice {
    return {
        uid: descriptor.uniqueIdentifier,
        name: descriptor.name,
        model: descriptor.modelID,
        groupId: descriptor.groupID || null,
        isLocal: descriptor.isLocalDevice,
        isGroupLeader: descriptor.isGroupLeader,
        hasVolumeControl: descriptor.isVolumeControlAvailable
    };
}

function sameOutputs(a: readonly OutputDevice[], b: readonly OutputDevice[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export class MultiroomController extends EventEmitter<MultiroomEventMap> implements MultiroomControl {
    get clusterId(): string | null {
        return this.#state.clusterID;
    }

    get isClusterAware(): boolean {
        return this.#state.isClusterAware;
    }

    get isLeader(): boolean {
        return this.#state.isClusterLeader;
    }

    get outputs(): readonly OutputDevice[] {
        return this.#outputs;
    }

    readonly #remote: () => MediaRemote | undefined;
    readonly #state: MediaRemoteState;
    #outputs: readonly OutputDevice[] = [];

    constructor(state: MediaRemoteState, remote: () => MediaRemote | undefined) {
        super();

        this.#remote = remote;
        this.#state = state;

        state.on('outputDevicesChanged', devices => this.#update(devices.map(toOutputDevice)));
    }

    async add(...deviceUids: string[]): Promise<void> {
        await this.#require().outputDevices.add(deviceUids);
    }

    async remove(...deviceUids: string[]): Promise<void> {
        await this.#require().outputDevices.remove(deviceUids);
    }

    async set(...deviceUids: string[]): Promise<void> {
        await this.#require().outputDevices.set(deviceUids);
    }

    async getVolume(deviceUid: string): Promise<number> {
        return await this.#require().volume.getForDevice(deviceUid);
    }

    async setVolume(deviceUid: string, level: number): Promise<void> {
        await this.#require().volume.setForDevice(deviceUid, level);
    }

    async mute(deviceUid: string): Promise<void> {
        await this.#require().volume.muteDevice(deviceUid);
    }

    async unmute(deviceUid: string): Promise<void> {
        await this.#require().volume.unmuteDevice(deviceUid);
    }

    /** Forgets the announced outputs, as for a new device. Called at the start of a disconnect. */
    reset(): void {
        this.#outputs = [];
    }

    #require(): MediaRemote {
        return requireSession(this.#remote(), 'multiroom');
    }

    #update(outputs: readonly OutputDevice[]): void {
        if (sameOutputs(this.#outputs, outputs)) {
            return;
        }

        this.#outputs = outputs;
        this.emit('change', outputs);
    }
}
