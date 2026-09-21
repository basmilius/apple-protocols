import type { EventEmitter } from 'node:events';
import {
    AIRPLAY_PROTOCOL,
    AppleTV,
    COMPANION_LINK_PROTOCOL,
    createDevice,
    discover,
    type DiscoveredDevice,
    HomePod,
    type Storage,
    TimingServer
} from '@basmilius/apple-sdk';
import type { CallRequest, CallResult, DeviceEvent, DeviceEventSource, DeviceSessionStatus, DiscoveredDeviceInfo, ProtocolName, ServiceInfo, StateSnapshot } from '@shared/contract';
import { runCall, type CallRoots } from './call';
import {
    AIRPLAY_STATE_EVENTS,
    ARTWORK_EVENTS,
    COMPANION_LINK_EVENTS,
    DATA_STREAM_EVENTS,
    DEVICE_EVENTS,
    EVENT_STREAM_EVENTS,
    STATE_EVENTS
} from './events';
import { serializeAll } from './serialize';
import { buildSnapshot, emptySnapshot } from './snapshot';

type Device = AppleTV | HomePod;

/** The sources whose events change what a snapshot reports. A raw data stream frame does not. */
const SNAPSHOT_SOURCES: readonly DeviceEventSource[] = ['device', 'state', 'airplayState', 'companionLink'];

export type SessionHost = {
    emitEvent(event: DeviceEvent): void;
    emitSnapshot(snapshot: StateSnapshot): void;
    emitDiscovery(): void;
};

/**
 * One connected device, its event forwarding and the roots `device:call` may reach. A session
 * outlives a disconnect so the renderer keeps a snapshot to look at.
 */
export class DeviceSession {
    readonly #host: SessionHost;
    readonly #timingServer: TimingServer;
    readonly #unsubscribes: (() => void)[] = [];

    #discovered: DiscoveredDevice;
    #device: Device | null = null;
    #status: DeviceSessionStatus = 'disconnected';
    #error: string | null = null;
    #artworkUrl: string | null = null;
    #artworkPending = false;
    #snapshotQueued = false;

    constructor(discovered: DiscoveredDevice, host: SessionHost, timingServer: TimingServer) {
        this.#discovered = discovered;
        this.#host = host;
        this.#timingServer = timingServer;
    }

    get id(): string {
        return this.#discovered.id;
    }

    get status(): DeviceSessionStatus {
        return this.#status;
    }

    get discovered(): DiscoveredDevice {
        return this.#discovered;
    }

    /** The connected SDK device, or null while disconnected. */
    get device(): Device | null {
        return this.#device;
    }

    set discovered(discovered: DiscoveredDevice) {
        this.#discovered = discovered;
    }

    /**
     * Connects over AirPlay, and over Companion Link when credentials for it are stored. An Apple
     * TV needs credentials; a HomePod pairs transiently and needs none.
     *
     * @param storage - Where the credentials per service id live.
     */
    async connect(storage: Storage): Promise<StateSnapshot> {
        if (this.#device !== null) {
            await this.disconnect();
        }

        this.#status = 'connecting';
        this.#error = null;
        this.#host.emitDiscovery();

        const device = createDevice(this.#discovered);
        device.timingServer = this.#timingServer;
        this.#device = device;

        this.#watch('device', device as unknown as EventEmitter, DEVICE_EVENTS);
        this.#watch('state', device.state as unknown as EventEmitter, STATE_EVENTS);
        this.#watch('airplayState', device.airplay.state as unknown as EventEmitter, AIRPLAY_STATE_EVENTS);

        try {
            if (device instanceof AppleTV) {
                const credentials = storage.getCredentials(this.#discovered.services.airplay?.id ?? this.#discovered.id, 'airplay');

                if (!credentials) {
                    throw new Error('No AirPlay credentials stored for this device. Pair first.');
                }

                await device.connect(credentials);
            } else {
                await device.connect();
            }
        } catch (error) {
            this.#status = 'failed';
            this.#error = error instanceof Error ? error.message : String(error);
            this.#teardown();
            this.#device = null;
            this.#host.emitDiscovery();

            throw error;
        }

        this.#status = 'connected';
        this.#watchStreams(device);

        if (device instanceof AppleTV && device.companionLink) {
            this.#watch('companionLink', device.companionLink as unknown as EventEmitter, COMPANION_LINK_EVENTS);
        }

        this.#host.emitDiscovery();
        void this.refreshArtwork();

        return this.snapshot();
    }

    async disconnect(): Promise<void> {
        const device = this.#device;
        this.#teardown();
        this.#device = null;
        this.#status = 'disconnected';
        this.#error = null;
        this.#artworkUrl = null;

        if (device !== null) {
            try {
                device.disconnect();
            } catch {
                // A socket that is already gone is exactly what disconnecting wanted.
            }
        }

        this.#host.emitDiscovery();
        this.#host.emitSnapshot(this.snapshot());
    }

    snapshot(): StateSnapshot {
        if (this.#device === null) {
            return emptySnapshot(this.id, this.#status, this.#error);
        }

        return buildSnapshot({
            deviceId: this.id,
            device: this.#device,
            deviceType: this.#discovered.deviceType,
            status: this.#status,
            error: this.#error,
            artworkUrl: this.#artworkUrl
        });
    }

    async call(request: CallRequest): Promise<CallResult> {
        return await runCall(this.roots(), request);
    }

    /** The objects a `device:call` path may start from. */
    roots(): CallRoots {
        const device = this.#device;

        if (device === null) {
            return {};
        }

        const companionLink = device instanceof AppleTV ? device.companionLink : undefined;

        return {
            device,
            airplay: device.airplay,
            airplayState: device.airplay.state,
            companionLink,
            airplayProtocol: device.airplay[AIRPLAY_PROTOCOL],
            companionLinkProtocol: companionLink?.[COMPANION_LINK_PROTOCOL]
        };
    }

    /**
     * Resolves the artwork of the active item and caches it as a data URL, so a snapshot stays
     * synchronous. A second call while one is in flight is dropped.
     */
    async refreshArtwork(): Promise<void> {
        const device = this.#device;

        if (device === null || this.#artworkPending) {
            return;
        }

        this.#artworkPending = true;

        try {
            const artwork = await device.artwork.get();

            if (artwork === null) {
                this.#artworkUrl = null;
            } else if (artwork.data !== null && artwork.data.byteLength > 0) {
                this.#artworkUrl = `data:${artwork.mimeType};base64,${Buffer.from(artwork.data).toString('base64')}`;
            } else {
                this.#artworkUrl = artwork.url;
            }
        } catch {
            this.#artworkUrl = null;
        } finally {
            this.#artworkPending = false;
        }

        this.#host.emitSnapshot(this.snapshot());
    }

    #watchStreams(device: Device): void {
        const protocol = device.airplay[AIRPLAY_PROTOCOL];

        if (protocol.dataStream) {
            this.#watch('dataStream', protocol.dataStream as unknown as EventEmitter, DATA_STREAM_EVENTS);
        }

        if (protocol.eventStream) {
            this.#watch('eventStream', protocol.eventStream as unknown as EventEmitter, EVENT_STREAM_EVENTS);
        }
    }

    #watch(source: DeviceEventSource, emitter: EventEmitter, names: readonly string[]): void {
        for (const name of names) {
            const listener = (...args: unknown[]): void => this.#forward(source, name, args);

            emitter.on(name, listener);
            this.#unsubscribes.push(() => emitter.off(name, listener));
        }
    }

    #forward(source: DeviceEventSource, name: string, args: readonly unknown[]): void {
        this.#host.emitEvent({
            deviceId: this.id,
            source,
            name,
            payload: serializeAll(args),
            timestamp: Date.now(),
            sequence: nextSequence()
        });

        if (source === 'device' && (name === 'connected' || name === 'disconnected')) {
            this.#status = name === 'connected' ? 'connected' : 'disconnected';
            this.#host.emitDiscovery();
        }

        if (source === 'device' && name === 'recovering') {
            this.#status = 'recovering';
            this.#host.emitDiscovery();
        }

        if (source === 'device' && name === 'recoveryFailed') {
            this.#status = 'failed';
            this.#host.emitDiscovery();
        }

        if (ARTWORK_EVENTS.includes(name)) {
            void this.refreshArtwork();
            return;
        }

        if (SNAPSHOT_SOURCES.includes(source)) {
            this.#scheduleSnapshot();
        }
    }

    /*
     * A snapshot walks every client and player, and a burst of protocol messages would rebuild it
     * once per message. One per tick is as often as the renderer can paint anyway.
     */
    #scheduleSnapshot(): void {
        if (this.#snapshotQueued) {
            return;
        }

        this.#snapshotQueued = true;

        setImmediate(() => {
            this.#snapshotQueued = false;
            this.#host.emitSnapshot(this.snapshot());
        });
    }

    #teardown(): void {
        for (const unsubscribe of this.#unsubscribes.splice(0)) {
            unsubscribe();
        }
    }
}

/**
 * Every connected device at once. The timing server is one per process: it is a UDP listener the
 * devices synchronize against, and closing it because one device went away would break the rest.
 */
export class SessionManager {
    readonly #sessions = new Map<string, DeviceSession>();
    readonly #host: SessionHost;
    readonly #storage: Storage;

    #timingServer: TimingServer | null = null;
    #discovered = new Map<string, DiscoveredDevice>();

    constructor(host: SessionHost, storage: Storage) {
        this.#host = host;
        this.#storage = storage;

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
    }

    get sessions(): ReadonlyMap<string, DeviceSession> {
        return this.#sessions;
    }

    /**
     * Scans the network and merges the result with what storage knows about pairing.
     *
     * @param rescan - Skips the discovery cache and queries mDNS again.
     */
    async discover(rescan = false): Promise<readonly DiscoveredDeviceInfo[]> {
        const found = await discover({useCache: !rescan});
        this.#discovered = new Map(found.map(device => [device.id, device]));

        for (const [id, session] of this.#sessions) {
            const device = this.#discovered.get(id);

            if (device) {
                session.discovered = device;
            } else {
                this.#discovered.set(id, session.discovered);
            }
        }

        return this.list();
    }

    list(): readonly DiscoveredDeviceInfo[] {
        return Array.from(this.#discovered.values()).map(device => this.#describe(device));
    }

    /** The raw discovery result, which pairing needs for a device it has no session for yet. */
    discoveredDevice(deviceId: string): DiscoveredDevice | null {
        return this.#discovered.get(deviceId) ?? null;
    }

    /** The shared NTP timing server, started on first use. RAOP streams against the same one. */
    async timingServer(): Promise<TimingServer> {
        return await this.#timing();
    }

    async connect(deviceId: string): Promise<StateSnapshot> {
        const discovered = this.#discovered.get(deviceId);

        if (!discovered) {
            throw new Error(`Device '${deviceId}' is not in the last discovery result. Scan first.`);
        }

        const session = this.#sessions.get(deviceId) ?? new DeviceSession(discovered, this.#host, await this.#timing());
        this.#sessions.set(deviceId, session);
        session.discovered = discovered;

        const snapshot = await session.connect(this.#storage);
        this.#host.emitSnapshot(snapshot);

        return snapshot;
    }

    async disconnect(deviceId: string): Promise<void> {
        const session = this.#sessions.get(deviceId);

        if (!session) {
            return;
        }

        await session.disconnect();
    }

    snapshot(deviceId: string): StateSnapshot | null {
        return this.#sessions.get(deviceId)?.snapshot() ?? null;
    }

    async call(request: CallRequest): Promise<CallResult> {
        const session = this.#sessions.get(request.deviceId);

        if (!session) {
            return {ok: false, error: {name: 'Error', message: `No session for device '${request.deviceId}'.`, stack: null}};
        }

        return await session.call(request);
    }

    async shutdown(): Promise<void> {
        await Promise.all(Array.from(this.#sessions.values()).map(session => session.disconnect()));
        this.#sessions.clear();
        this.#timingServer?.close();
        this.#timingServer = null;
    }

    async #timing(): Promise<TimingServer> {
        if (this.#timingServer === null) {
            const server = new TimingServer();
            await server.listen();
            this.#timingServer = server;
        }

        return this.#timingServer;
    }

    #describe(device: DiscoveredDevice): DiscoveredDeviceInfo {
        const paired: ProtocolName[] = [];

        if (this.#storage.getCredentials(device.services.airplay?.id ?? device.id, 'airplay')) {
            paired.push('airplay');
        }

        if (this.#storage.getCredentials(device.services.companionLink?.id ?? device.id, 'companionLink')) {
            paired.push('companionLink');
        }

        return {
            id: device.id,
            name: device.name,
            address: device.address,
            modelName: device.modelName,
            deviceType: device.deviceType,
            services: {
                airplay: serviceOf(device.services.airplay),
                companionLink: serviceOf(device.services.companionLink)
            },
            paired,
            session: this.#sessions.get(device.id)?.status ?? 'disconnected'
        };
    }
}

let sequence = 0;

function nextSequence(): number {
    sequence += 1;
    return sequence;
}

function serviceOf(result: DiscoveredDevice['services']['airplay']): ServiceInfo | null {
    if (!result) {
        return null;
    }

    return {
        id: result.id,
        fqdn: result.fqdn,
        address: result.address,
        port: result.service.port,
        type: result.service.type,
        txt: (result.txt ?? {}) as Record<string, string>
    };
}
