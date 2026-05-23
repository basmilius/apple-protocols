import * as AirPlay from '@basmilius/apple-airplay';
import * as CompanionLink from '@basmilius/apple-companion-link';
import type { JsonStorage } from '@basmilius/apple-common';
import type {
    DeviceProtocol,
    PairingResult,
    PairingStartPayload,
    PairingUnpairedPayload
} from '@shared/snapshots';
import type { DiscoveryCache } from './discoveryCache';

type Events = {
    started: PairingStartPayload;
    pinRequested: null;
    ended: PairingResult;
    unpaired: PairingUnpairedPayload;
};

type Listener<E extends keyof Events> = (data: Events[E]) => void;

export class PairingSessionService {
    #pairingResolve: ((pin: string) => void) | null = null;
    #pairingReject: ((err: Error) => void) | null = null;
    #pairingProtocol: AirPlay.Protocol | CompanionLink.Protocol | null = null;
    readonly #listeners = new Map<keyof Events, Set<Listener<keyof Events>>>();

    constructor(
        private readonly storage: JsonStorage,
        private readonly discovery: DiscoveryCache
    ) {}

    get isPairing(): boolean {
        return this.#pairingResolve !== null;
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

    async start(deviceId: string, protocol: DeviceProtocol): Promise<void> {
        if (this.#pairingResolve) {
            throw new Error('A pairing session is already active');
        }

        if (protocol === 'airplay') {
            await this.#pairAirPlay(deviceId);
        } else {
            await this.#pairCompanionLink(deviceId);
        }
    }

    submitPin(pin: string): void {
        if (!this.#pairingResolve) {
            throw new Error('No pairing session waiting for PIN');
        }

        const resolve = this.#pairingResolve;
        this.#pairingResolve = null;
        this.#pairingReject = null;
        resolve(pin);
    }

    cancel(): void {
        if (this.#pairingReject) {
            const reject = this.#pairingReject;
            this.#pairingReject = null;
            this.#pairingResolve = null;
            reject(new Error('Cancelled'));
        }

        if (this.#pairingProtocol) {
            this.#pairingProtocol.disconnect();
            this.#pairingProtocol = null;
        }
    }

    async unpair(deviceId: string, protocol: DeviceProtocol): Promise<void> {
        this.storage.removeCredentials(deviceId, protocol);
        await this.storage.save();
        this.#emit('unpaired', {deviceId, protocol});
    }

    async verify(deviceId: string, protocol?: DeviceProtocol): Promise<DeviceProtocol> {
        const preferred = protocol ?? (this.storage.getCredentials(deviceId, 'airplay') ? 'airplay' : 'companionLink');
        const credentials = this.storage.getCredentials(deviceId, preferred);

        if (!credentials) {
            throw new Error(`No ${preferred} credentials saved for ${deviceId}`);
        }

        if (preferred === 'airplay') {
            const device = this.discovery.findAirplay(deviceId);
            if (!device) {
                throw new Error(`AirPlay device not discovered: ${deviceId}`);
            }

            const proto = new AirPlay.Protocol(device);
            try {
                await proto.connect();
                await proto.fetchInfo();
                await proto.verify.start(credentials);
            } finally {
                try {
                    proto.disconnect();
                } catch {
                    // Ignore.
                }
            }
        } else {
            const airplay = this.discovery.findAirplay(deviceId);
            const direct = this.discovery.findCompanion(deviceId);
            const companion = direct ?? (airplay ? this.discovery.findCompanionFor(airplay) : undefined);

            if (!companion) {
                throw new Error(`Companion Link service not found for ${deviceId}`);
            }

            const proto = new CompanionLink.Protocol(companion);
            try {
                await proto.connect();
                await proto.verify.start(credentials);
            } finally {
                try {
                    proto.disconnect();
                } catch {
                    // Ignore.
                }
            }
        }

        return preferred;
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

    async #pairAirPlay(deviceId: string): Promise<void> {
        const device = this.discovery.findAirplay(deviceId);

        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        const protocol = new AirPlay.Protocol(device);
        this.#pairingProtocol = protocol;

        this.#emit('started', {
            deviceId,
            protocol: 'airplay',
            deviceName: device.fqdn
        });

        try {
            await protocol.connect();
            await protocol.fetchInfo();
            await protocol.pairing.start();

            const credentials = await protocol.pairing.pin(() => this.#awaitPin());

            this.storage.setDevice(device.id, {
                identifier: device.id,
                name: device.fqdn
            });
            this.storage.setCredentials(device.id, 'airplay', credentials);
            await this.storage.save();

            this.#emit('ended', {success: true});
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.#emit('ended', {success: false, error: message});
        } finally {
            protocol.disconnect();
            this.#pairingProtocol = null;
            this.#pairingResolve = null;
            this.#pairingReject = null;
        }
    }

    async #pairCompanionLink(deviceId: string): Promise<void> {
        const airplay = this.discovery.findAirplay(deviceId);
        const direct = this.discovery.findCompanion(deviceId);
        const companion = direct ?? (airplay ? this.discovery.findCompanionFor(airplay) : undefined);

        if (!companion) {
            throw new Error('Companion Link service not found for this device');
        }

        const protocol = new CompanionLink.Protocol(companion);
        this.#pairingProtocol = protocol;

        this.#emit('started', {
            deviceId,
            protocol: 'companionLink',
            deviceName: companion.fqdn
        });

        try {
            await protocol.connect();
            await protocol.pairing.start();

            const credentials = await protocol.pairing.pin(() => this.#awaitPin());

            this.storage.setDevice(companion.id, {
                identifier: companion.id,
                name: companion.fqdn
            });
            this.storage.setCredentials(companion.id, 'companionLink', credentials);
            await this.storage.save();

            this.#emit('ended', {success: true});
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.#emit('ended', {success: false, error: message});
        } finally {
            protocol.disconnect();
            this.#pairingProtocol = null;
            this.#pairingResolve = null;
            this.#pairingReject = null;
        }
    }

    #awaitPin(): Promise<string> {
        this.#emit('pinRequested', null);

        return new Promise<string>((resolve, reject) => {
            this.#pairingResolve = resolve;
            this.#pairingReject = reject;
        });
    }
}
