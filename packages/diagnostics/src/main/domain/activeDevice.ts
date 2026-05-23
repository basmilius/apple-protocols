import { TimingServer, type DiscoveryResult, type JsonStorage } from '@basmilius/apple-common';
import { AppleTV, HomePod, HomePodMini } from '@basmilius/apple-sdk';
import type { AttentionState as SdkAttentionState } from '@basmilius/apple-sdk';
import type { AttentionState, DeviceInfo, StateSnapshot } from '@shared/snapshots';
import { emptyState } from '@shared/snapshots';
import { buildStateSnapshot } from '../util/stateSnapshot';
import { detectDeviceType } from './storage';
import type { DiscoveryCache } from './discoveryCache';

type Events = {
    connected: DeviceInfo;
    disconnected: {unexpected: boolean};
    state: StateSnapshot;
    recovering: {attempt: number};
    'recovery-failed': null;
};

type Listener<E extends keyof Events> = (data: Events[E]) => void;

const ATTENTION_MAP: Record<string, AttentionState> = {
    unknown: 'unknown',
    asleep: 'asleep',
    screensaver: 'screensaver',
    awake: 'awake',
    idle: 'idle'
};

function mapAttention(state: SdkAttentionState | string | undefined): AttentionState {
    if (!state) {
        return 'unknown';
    }

    return ATTENTION_MAP[state] ?? 'unknown';
}

export class ActiveDeviceService {
    #device: AppleTV | HomePod | null = null;
    #deviceInfo: DeviceInfo | null = null;
    #companionLinkReady = false;
    #powerState: AttentionState | null = null;
    #ownTimingServer: TimingServer | null = null;
    readonly #listeners = new Map<keyof Events, Set<Listener<keyof Events>>>();
    readonly #stateUnsubscribers: Array<() => void> = [];

    constructor(
        private readonly storage: JsonStorage,
        private readonly discovery: DiscoveryCache,
        private readonly resolveTimingServer: () => TimingServer | null
    ) {}

    get isConnected(): boolean {
        return this.#device !== null;
    }

    get device(): AppleTV | HomePod | null {
        return this.#device;
    }

    get appleTV(): AppleTV | null {
        return this.#device instanceof AppleTV ? this.#device : null;
    }

    requireDevice(): AppleTV | HomePod {
        if (!this.#device) {
            throw new Error('No device connected');
        }

        return this.#device;
    }

    requireAppleTV(): AppleTV {
        if (!(this.#device instanceof AppleTV)) {
            throw new Error('This action requires an Apple TV');
        }

        return this.#device;
    }

    snapshot(): StateSnapshot {
        if (!this.#device || !this.#deviceInfo) {
            return emptyState();
        }

        return buildStateSnapshot({
            device: this.#device,
            deviceInfo: this.#deviceInfo,
            companionLinkReady: this.#companionLinkReady,
            powerState: this.#powerState
        });
    }

    on<E extends keyof Events>(event: E, listener: Listener<E>): () => void {
        let set = this.#listeners.get(event);

        if (!set) {
            set = new Set();
            this.#listeners.set(event, set);
        }

        set.add(listener as Listener<keyof Events>);

        return () => {
            set?.delete(listener as Listener<keyof Events>);
        };
    }

    async connect(deviceId: string): Promise<StateSnapshot> {
        if (this.#device) {
            await this.disconnect();
        }

        const airplay = this.discovery.findAirplay(deviceId);

        if (!airplay) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        if (airplay.txt.model?.startsWith('AppleTV')) {
            await this.#connectAppleTV(airplay);
        } else {
            await this.#connectHomePod(airplay);
        }

        return this.snapshot();
    }

    async connectByIp(address: string, port: number = 7000): Promise<StateSnapshot> {
        if (this.#device) {
            await this.disconnect();
        }

        const synthetic: DiscoveryResult = {
            id: address,
            fqdn: address,
            address,
            modelName: 'Unknown',
            familyName: null,
            txt: {},
            service: {port, protocol: 'tcp', type: '_airplay._tcp.local'},
            packet: {} as any
        };

        if (this.storage.getCredentials(address, 'airplay')) {
            await this.#connectAppleTV(synthetic);
        } else {
            await this.#connectHomePod(synthetic);
        }

        return this.snapshot();
    }

    async disconnect(): Promise<void> {
        if (!this.#device) {
            return;
        }

        for (const off of this.#stateUnsubscribers) {
            off();
        }

        this.#stateUnsubscribers.length = 0;

        try {
            this.#device.disconnect();
        } catch {
            // Already disconnected.
        }

        this.#closeOwnTimingServer();

        this.#device = null;
        this.#deviceInfo = null;
        this.#companionLinkReady = false;
        this.#powerState = null;

        this.#emit('disconnected', {unexpected: false});
    }

    async #ensureTimingServer(): Promise<TimingServer> {
        const shared = this.resolveTimingServer();
        if (shared) {
            return shared;
        }

        if (!this.#ownTimingServer) {
            const server = new TimingServer();
            await server.listen();
            this.#ownTimingServer = server;
        }

        return this.#ownTimingServer;
    }

    #closeOwnTimingServer(): void {
        if (this.#ownTimingServer) {
            this.#ownTimingServer.close();
            this.#ownTimingServer = null;
        }
    }

    async ensureMediaTimingServer(): Promise<void> {
        const timingServer = await this.#ensureTimingServer();

        if (this.#device) {
            this.#device.timingServer = timingServer;
        }
    }

    async #connectAppleTV(airplay: DiscoveryResult): Promise<void> {
        const companion = this.discovery.findCompanionFor(airplay);

        if (!companion) {
            throw new Error('Companion Link service not found for this Apple TV');
        }

        const credentials = this.storage.getCredentials(airplay.id, 'airplay');

        if (!credentials) {
            throw new Error(`No AirPlay credentials for ${airplay.fqdn} — pair first`);
        }

        const device = new AppleTV({airplay, companionLink: companion});

        this.#deviceInfo = {
            id: airplay.id,
            name: airplay.fqdn,
            model: airplay.txt.model ?? 'Unknown',
            address: airplay.address,
            port: airplay.service.port,
            type: 'appletv',
            protocols: ['airplay', 'companionLink'],
            paired: ['airplay']
        };

        this.#device = device;
        this.#subscribeAppleTV(device);

        const companionCreds =
            this.storage.getCredentials(companion.id, 'companionLink') ??
            this.storage.getCredentials(airplay.id, 'companionLink') ??
            credentials;

        device.airplay.setCredentials(credentials);
        await device.airplay.connect();

        this.#emit('connected', this.#deviceInfo);
        this.#emitState();

        if (device.companionLink) {
            try {
                await device.companionLink.setCredentials(companionCreds);
                await device.companionLink.connect();
                this.#companionLinkReady = true;
                if (this.storage.getCredentials(companion.id, 'companionLink') || this.storage.getCredentials(airplay.id, 'companionLink')) {
                    if (this.#deviceInfo && !this.#deviceInfo.paired.includes('companionLink')) {
                        this.#deviceInfo = {
                            ...this.#deviceInfo,
                            paired: [...this.#deviceInfo.paired, 'companionLink']
                        };
                    }
                }
                this.#emitState();

                if (device.power) {
                    try {
                        const state = await device.power.getState();
                        this.#powerState = mapAttention(state);
                        this.#emitState();
                    } catch {
                        // Power state optional.
                    }
                }
            } catch {
                // Companion Link is optional; still usable via AirPlay.
                this.#emitState();
            }
        }
    }

    async #connectHomePod(airplay: DiscoveryResult): Promise<void> {
        const model = airplay.txt.model ?? '';
        const type = detectDeviceType(model);

        const device = type === 'homepod-mini'
            ? new HomePodMini({airplay})
            : new HomePod({airplay});

        this.#deviceInfo = {
            id: airplay.id,
            name: airplay.fqdn,
            model: model || 'Unknown',
            address: airplay.address,
            port: airplay.service.port,
            type,
            protocols: ['airplay'],
            paired: []
        };

        this.#device = device;
        this.#subscribeHomePod(device);

        await device.connect();

        this.#emit('connected', this.#deviceInfo);
        this.#emitState();
    }

    #subscribeAppleTV(device: AppleTV): void {
        const onDisconnect = (unexpected: boolean): void => {
            for (const off of this.#stateUnsubscribers) {
                off();
            }
            this.#stateUnsubscribers.length = 0;
            this.#device = null;
            this.#deviceInfo = null;
            this.#powerState = null;
            this.#companionLinkReady = false;
            this.#closeOwnTimingServer();
            this.#emit('disconnected', {unexpected});
        };

        const onPower = (state: SdkAttentionState): void => {
            this.#powerState = mapAttention(state);
            this.#emitState();
        };

        device.on('disconnected', onDisconnect);
        device.on('power', onPower);

        this.#stateUnsubscribers.push(() => device.off('disconnected', onDisconnect));
        this.#stateUnsubscribers.push(() => device.off('power', onPower));

        this.#subscribeState(device);
    }

    #subscribeHomePod(device: HomePod): void {
        const onDisconnect = (unexpected: boolean): void => {
            for (const off of this.#stateUnsubscribers) {
                off();
            }
            this.#stateUnsubscribers.length = 0;
            this.#device = null;
            this.#deviceInfo = null;
            this.#closeOwnTimingServer();
            this.#emit('disconnected', {unexpected});
        };

        device.on('disconnected', onDisconnect);
        this.#stateUnsubscribers.push(() => device.off('disconnected', onDisconnect));

        this.#subscribeState(device);
    }

    #subscribeState(device: AppleTV | HomePod): void {
        const state = device.airplay.state;
        const emit = (): void => this.#emitState();

        const events = [
            'setState',
            'volumeDidChange',
            'volumeMutedDidChange',
            'volumeControlAvailability',
            'clients',
            'playerClientParticipantsUpdate',
            'setArtwork',
            'updateContentItem',
            'updateContentItemArtwork',
            'setNowPlayingClient',
            'setNowPlayingPlayer',
            'removeClient',
            'removePlayer',
            'updatePlayer',
            'updateClient',
            'keyboard'
        ] as const;

        for (const event of events) {
            state.on(event, emit);
            this.#stateUnsubscribers.push(() => state.off(event, emit));
        }
    }

    #emit<E extends keyof Events>(event: E, data: Events[E]): void {
        const set = this.#listeners.get(event);

        if (!set) {
            return;
        }

        for (const listener of set) {
            (listener as Listener<E>)(data);
        }
    }

    #emitState(): void {
        this.#emit('state', this.snapshot());
    }
}
