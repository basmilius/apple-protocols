import * as AirPlay from '@basmilius/apple-airplay';
import {
    type AccessoryKeys,
    type AudioSource,
    Context,
    type DiscoveryResult,
    type JsonStorage,
    type TimingServer
} from '@basmilius/apple-common';
import type { MultiRoomTarget, MultiRoomTargetStatus } from '@shared/snapshots';
import type { DiscoveryCache } from './discoveryCache';

type Listener = (event: {deviceId: string; status: MultiRoomTargetStatus; error?: string}) => void;

type PreparedTarget = {
    deviceId: string;
    deviceName: string;
    discoveryResult: DiscoveryResult;
    protocol: AirPlay.Protocol;
    keys: AccessoryKeys;
    feedbackInterval: NodeJS.Timeout;
};

export class MultiRoomService {
    readonly #targets = new Map<string, PreparedTarget>();
    readonly #targetStatus = new Map<string, MultiRoomTarget>();
    readonly #listeners = new Set<Listener>();
    #multiplexer: AirPlay.AudioMultiplexer | null = null;
    #activeStream: Promise<void> | null = null;

    constructor(
        private readonly storage: JsonStorage,
        private readonly discovery: DiscoveryCache,
        private readonly resolveTimingServer: () => TimingServer | null
    ) {}

    get isStreaming(): boolean {
        return this.#activeStream !== null;
    }

    targets(): MultiRoomTarget[] {
        return Array.from(this.#targetStatus.values());
    }

    addListener(listener: Listener): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    async prepare(deviceIds: string[]): Promise<MultiRoomTarget[]> {
        this.#requireTimingServer();
        await this.stop();

        this.#targetStatus.clear();
        this.#targets.clear();

        for (const deviceId of deviceIds) {
            const device = this.discovery.findAirplay(deviceId);
            const name = device?.fqdn ?? deviceId;
            this.#updateStatus({deviceId, deviceName: name, status: 'preparing'});
        }

        for (const deviceId of deviceIds) {
            await this.#prepareDevice(deviceId);
        }

        return this.targets();
    }

    async add(deviceId: string): Promise<MultiRoomTarget> {
        this.#requireTimingServer();

        const existing = this.#targetStatus.get(deviceId);
        if (existing && existing.status === 'ok') {
            return existing;
        }

        const device = this.discovery.findAirplay(deviceId);
        this.#updateStatus({
            deviceId,
            deviceName: device?.fqdn ?? deviceId,
            status: 'preparing'
        });

        await this.#prepareDevice(deviceId);

        if (this.#multiplexer && this.#targets.has(deviceId)) {
            this.#multiplexer.addTarget(this.#targets.get(deviceId)!.protocol);
        }

        return this.#targetStatus.get(deviceId)!;
    }

    async remove(deviceId: string): Promise<void> {
        const target = this.#targets.get(deviceId);

        if (!target) {
            return;
        }

        clearInterval(target.feedbackInterval);

        try {
            target.protocol.disconnect();
        } catch {
            // Already disconnected.
        }

        this.#targets.delete(deviceId);
        this.#updateStatus({
            deviceId,
            deviceName: target.deviceName,
            status: 'removed'
        });
    }

    async streamUrl(url: string): Promise<void> {
        const {Url} = await import('@basmilius/apple-audio-source');
        const source = await Url.fromUrl(url);
        await this.#stream(source);
    }

    async streamFile(path: string): Promise<void> {
        const {File} = await import('@basmilius/apple-audio-source');
        const source = await File.fromPath(path);
        await this.#stream(source);
    }

    async stop(): Promise<void> {
        if (this.#multiplexer) {
            this.#multiplexer.clear();
            this.#multiplexer = null;
        }

        for (const target of this.#targets.values()) {
            clearInterval(target.feedbackInterval);
            try {
                target.protocol.disconnect();
            } catch {
                // Ignore.
            }
        }

        this.#targets.clear();
        this.#activeStream = null;
    }

    async #stream(source: AudioSource): Promise<void> {
        if (this.#targets.size < 2) {
            throw new Error('Multi-room requires at least 2 prepared targets');
        }

        const context = new Context('multi-room');
        this.#multiplexer = new AirPlay.AudioMultiplexer(context);

        for (const target of this.#targets.values()) {
            this.#multiplexer.addTarget(target.protocol);
        }

        const streamPromise = this.#multiplexer.stream(source);
        this.#activeStream = streamPromise;

        try {
            await streamPromise;
        } finally {
            this.#activeStream = null;
        }
    }

    async #prepareDevice(deviceId: string): Promise<void> {
        const device = this.discovery.findAirplay(deviceId);

        if (!device) {
            this.#updateStatus({
                deviceId,
                deviceName: deviceId,
                status: 'failed',
                error: 'Device not discovered'
            });
            return;
        }

        const isAppleTV = (device.txt.model ?? '').startsWith('AppleTV');
        const timingServer = this.resolveTimingServer();

        if (!timingServer) {
            this.#updateStatus({
                deviceId,
                deviceName: device.fqdn,
                status: 'failed',
                error: 'No NTP timing server running'
            });
            return;
        }

        const protocol = new AirPlay.Protocol(device);
        protocol.useTimingServer(timingServer);

        try {
            await protocol.connect();
            await protocol.fetchInfo();

            let keys: AccessoryKeys;

            if (isAppleTV) {
                const credentials = this.storage.getCredentials(device.id, 'airplay');
                if (!credentials) {
                    throw new Error('Apple TV needs paired credentials');
                }
                keys = await protocol.verify.start(credentials);
            } else {
                await protocol.pairing.start();
                keys = await protocol.pairing.transient();
            }

            protocol.controlStream.enableEncryption(
                keys.accessoryToControllerKey,
                keys.controllerToAccessoryKey
            );

            await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

            const feedbackInterval = setInterval(() => {
                protocol.feedback().catch(() => {});
            }, 2000);

            this.#targets.set(deviceId, {
                deviceId,
                deviceName: device.fqdn,
                discoveryResult: device,
                protocol,
                keys,
                feedbackInterval
            });

            this.#updateStatus({
                deviceId,
                deviceName: device.fqdn,
                status: 'ok'
            });
        } catch (err) {
            try {
                protocol.disconnect();
            } catch {
                // Ignore.
            }

            this.#updateStatus({
                deviceId,
                deviceName: device.fqdn,
                status: 'failed',
                error: err instanceof Error ? err.message : String(err)
            });
        }
    }

    #updateStatus(target: MultiRoomTarget): void {
        this.#targetStatus.set(target.deviceId, target);

        for (const listener of this.#listeners) {
            listener({
                deviceId: target.deviceId,
                status: target.status,
                error: target.error
            });
        }
    }

    #requireTimingServer(): void {
        if (!this.resolveTimingServer()) {
            throw new Error('Start the NTP timing server before preparing multi-room targets');
        }
    }
}
