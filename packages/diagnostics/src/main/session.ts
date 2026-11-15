import type { EventEmitter } from 'node:events';
import { TimingServer } from '@corewire/airplay';
import { AppleTV, Credentials, HomePod, type Status } from '@corewire/devices';
import type { CallRequest, CallResult, DeviceEvent, DeviceEventSource, DeviceSessionStatus, DiscoveredDeviceInfo, ProtocolName, ServiceInfo, StateSnapshot } from '@shared/contract';
import { runCall, type CallRoots } from './call';
import { type DiscoveredDevice, discoverDevices, targetOf } from './discovery';
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
import type { JsonStorage } from './storage';

type Device = AppleTV | HomePod;

/** The sources whose events change what a snapshot reports. The model does not echo messages, so the data stream counts too. */
const SNAPSHOT_SOURCES: readonly DeviceEventSource[] = ['device', 'state', 'airplayState', 'companionLink', 'dataStream'];

const SESSION_STATUS: Record<Status['state'], DeviceSessionStatus> = {
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
    degraded: 'connected',
    recovering: 'recovering',
    offline: 'failed'
};

export type SessionHost = {
    emitEvent(event: DeviceEvent): void;
    emitSnapshot(snapshot: StateSnapshot): void;
    emitDiscovery(): void;
};

/** Keeps a device snapshot after disconnect and exposes the allowed `device:call` roots. */
export class DeviceSession {
    readonly #host: SessionHost;
    readonly #timingServer: TimingServer;
    readonly #unsubscribes: (() => void)[] = [];
    readonly #sessionUnsubscribes: (() => void)[] = [];

    #discovered: DiscoveredDevice;
    #device: Device | null = null;
    #status: DeviceSessionStatus = 'disconnected';
    #error: string | null = null;
    #artworkUrl: string | null = null;
    #artworkPending: Device | null = null;
    #snapshotQueued = false;
    #connecting?: Promise<StateSnapshot>;
    #generation = 0;
    #watched: readonly unknown[] = [];

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

    get device(): Device | null {
        return this.#device;
    }

    set discovered(discovered: DiscoveredDevice) {
        this.#discovered = discovered;
    }

    /** Connects AirPlay and, when credentials exist, Companion Link. Apple TV needs credentials; HomePod pairs transiently. */
    async connect(storage: JsonStorage): Promise<StateSnapshot> {
        if (this.#connecting) {
            return this.#connecting;
        }

        if (this.#status === 'connected' && this.#device) {
            return this.snapshot();
        }

        const operation = this.#connect(storage);
        this.#connecting = operation;

        try {
            return await operation;
        } finally {
            if (this.#connecting === operation) {
                this.#connecting = undefined;
            }
        }
    }

    async #connect(storage: JsonStorage): Promise<StateSnapshot> {
        const generation = ++this.#generation;
        const previous = this.#device;
        this.#status = 'connecting';
        this.#error = null;
        this.#host.emitDiscovery();

        // A device that is recovering or offline still runs its sessions; a second one with the same
        // pairing makes the Apple TV close the other's Companion Link, over and over.
        if (previous !== null) {
            this.#teardown();
            this.#device = null;
            await previous.disconnect().catch(() => undefined);

            if (generation !== this.#generation) {
                throw new Error('Device connect canceled.');
            }
        }

        let device: Device;

        try {
            device = this.#create(storage);
        } catch (error) {
            this.#status = 'failed';
            this.#error = error instanceof Error ? error.message : String(error);
            this.#host.emitDiscovery();

            throw error;
        }

        this.#device = device;

        this.#watch('device', device as unknown as EventEmitter, DEVICE_EVENTS);
        this.#watch('state', device.nowPlaying as unknown as EventEmitter, STATE_EVENTS, 'nowPlaying.');
        this.#watch('state', device.volume as unknown as EventEmitter, ['change'], 'volume.');

        if (device instanceof AppleTV) {
            this.#watch('state', device.power as unknown as EventEmitter, ['change'], 'power.');
            this.#watch('state', device.text as unknown as EventEmitter, ['change'], 'text.');
        }

        try {
            await device.connect();

            if (generation !== this.#generation || this.#device !== device) {
                throw new Error('Device connect canceled.');
            }
        } catch (error) {
            void device.disconnect().catch(() => undefined);

            if (generation !== this.#generation || this.#device !== device) {
                throw error;
            }

            this.#status = 'failed';
            this.#error = error instanceof Error ? error.message : String(error);
            this.#teardown();
            this.#device = null;
            this.#host.emitDiscovery();

            throw error;
        }

        this.#status = 'connected';
        this.#watchSessions(device);
        this.#host.emitDiscovery();
        void this.refreshArtwork();

        return this.snapshot();
    }

    async disconnect(): Promise<void> {
        this.#generation++;
        const device = this.#device;
        this.#teardown();
        this.#device = null;
        this.#status = 'disconnected';
        this.#error = null;
        this.#artworkUrl = null;

        if (device !== null) {
            await device.disconnect().catch(() => undefined);
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

    /** The objects a `device:call` path may start from: the device and the sessions it uses now. */
    roots(): CallRoots {
        const device = this.#device;

        if (device === null) {
            return {};
        }

        const sessions = device.sessions;

        return {
            device,
            airplay: sessions.airplay,
            mediaRemote: sessions.mediaRemote,
            companionLink: sessions.companionLink
        };
    }

    /** Caches artwork as a data URL to keep snapshots synchronous. Ignores calls while a fetch is in flight. */
    async refreshArtwork(): Promise<void> {
        const device = this.#device;

        if (device === null || this.#artworkPending === device) {
            return;
        }

        this.#artworkPending = device;

        try {
            const artwork = await device.artwork.get();

            if (this.#device !== device) {
                return;
            }

            if (artwork === null) {
                this.#artworkUrl = null;
            } else if (artwork.data !== null && artwork.data.byteLength > 0) {
                this.#artworkUrl = `data:${artwork.mimeType};base64,${Buffer.from(artwork.data).toString('base64')}`;
            } else {
                this.#artworkUrl = artwork.url;
            }
        } catch {
            if (this.#device === device) {
                this.#artworkUrl = null;
            }
        } finally {
            if (this.#artworkPending === device) {
                this.#artworkPending = null;
            }
        }

        this.#host.emitSnapshot(this.snapshot());
    }

    #create(storage: JsonStorage): Device {
        const target = targetOf(this.#discovered);

        if (this.#discovered.deviceType !== 'appletv') {
            return new HomePod(target, {timing: this.#timingServer});
        }

        const credentials = storage.getCredentials(this.#discovered.services.airplay?.id ?? this.#discovered.id, 'airplay');

        if (!credentials) {
            throw new Error('No AirPlay credentials stored for this device. Pair first.');
        }

        return new AppleTV(target, {credentials: Credentials.from(credentials), timing: this.#timingServer});
    }

    /** A recovery brings new sessions; the channel and model watchers follow them. */
    #watchSessions(device: Device): void {
        const sessions = device.sessions;
        const watched = [sessions.airplay, sessions.mediaRemote, sessions.companionLink];

        if (watched.every((session, index) => session === this.#watched[index])) {
            return;
        }

        for (const unsubscribe of this.#sessionUnsubscribes.splice(0)) {
            unsubscribe();
        }

        this.#watched = watched;

        const remote = sessions.airplay?.remoteControl;

        if (remote) {
            this.#watch('dataStream', remote.data as unknown as EventEmitter, DATA_STREAM_EVENTS, '', this.#sessionUnsubscribes);
            this.#watch('eventStream', remote.events as unknown as EventEmitter, EVENT_STREAM_EVENTS, '', this.#sessionUnsubscribes);
        }

        if (sessions.mediaRemote) {
            this.#watch('airplayState', sessions.mediaRemote.state as unknown as EventEmitter, AIRPLAY_STATE_EVENTS, '', this.#sessionUnsubscribes);
        }

        if (sessions.companionLink) {
            this.#watch('companionLink', sessions.companionLink.state as unknown as EventEmitter, COMPANION_LINK_EVENTS, '', this.#sessionUnsubscribes);
        }
    }

    #watch(source: DeviceEventSource, emitter: EventEmitter, names: readonly string[], prefix: string = '', unsubscribes: (() => void)[] = this.#unsubscribes): void {
        for (const name of names) {
            const listener = (...args: unknown[]): void => this.#forward(source, `${prefix}${name}`, args);

            emitter.on(name, listener);
            unsubscribes.push(() => emitter.off(name, listener));
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

        if (source === 'device' && name === 'status') {
            this.#onStatus(args[0] as Status);
        }

        if (ARTWORK_EVENTS.includes(name)) {
            void this.refreshArtwork();
            return;
        }

        if (SNAPSHOT_SOURCES.includes(source)) {
            this.#scheduleSnapshot();
        }
    }

    #onStatus(status: Status): void {
        if (this.#connecting || this.#device === null) {
            return;
        }

        this.#status = SESSION_STATUS[status.state];
        this.#error = status.error?.message ?? null;
        this.#watchSessions(this.#device);
        this.#host.emitDiscovery();
    }

    /* Coalesce protocol bursts into one snapshot per tick; each snapshot walks all clients and players. */
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
        for (const unsubscribe of [...this.#unsubscribes.splice(0), ...this.#sessionUnsubscribes.splice(0)]) {
            unsubscribe();
        }

        this.#watched = [];
    }
}

/** Shares one timing server across sessions so disconnecting one device does not interrupt the others. */
export class SessionManager {
    readonly #sessions = new Map<string, DeviceSession>();
    readonly #host: SessionHost;
    readonly #storage: JsonStorage;

    #timingServer: TimingServer | null = null;
    #timingPromise?: Promise<TimingServer>;
    #discovered = new Map<string, DiscoveredDevice>();

    constructor(host: SessionHost, storage: JsonStorage) {
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
        const found = await discoverDevices(!rescan);
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

        const timing = await this.#timing();
        const session = this.#sessions.get(deviceId) ?? new DeviceSession(discovered, this.#host, timing);
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
        await this.#timingPromise?.catch(() => {});
        this.#timingServer?.close();
        this.#timingServer = null;
    }

    async #timing(): Promise<TimingServer> {
        if (this.#timingServer) {
            return this.#timingServer;
        }

        if (!this.#timingPromise) {
            const server = new TimingServer();

            this.#timingPromise = server.listen().then(() => {
                this.#timingServer = server;

                return server;
            }, error => {
                server.close();

                throw error;
            }).finally(() => {
                this.#timingPromise = undefined;
            });
        }

        return this.#timingPromise;
    }

    #describe(device: DiscoveredDevice): DiscoveredDeviceInfo {
        const paired: ProtocolName[] = [];

        if (this.#storage.hasCredentials(device.services.airplay?.id ?? device.id, 'airplay')) {
            paired.push('airplay');
        }

        if (this.#storage.hasCredentials(device.services.companionLink?.id ?? device.id, 'companionLink')) {
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
