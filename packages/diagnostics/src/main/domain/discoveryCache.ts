import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import type { JsonStorage } from '@basmilius/apple-common';
import type { DeviceInfo, DeviceProtocol } from '@shared/snapshots';
import { detectDeviceType, detectPairedProtocols } from './storage';

/** Include Apple TV / HomePod only; set to true to see other AirPlay devices. */
const SHOW_UNSUPPORTED_DEVICES = false;

export class DiscoveryCache {
    #airplay: DiscoveryResult[] = [];
    #companion: DiscoveryResult[] = [];
    #raop: DiscoveryResult[] = [];

    constructor(private readonly storage: JsonStorage) {}

    get airplay(): readonly DiscoveryResult[] {
        return this.#airplay;
    }

    get companion(): readonly DiscoveryResult[] {
        return this.#companion;
    }

    get raop(): readonly DiscoveryResult[] {
        return this.#raop;
    }

    findAirplay(deviceId: string): DiscoveryResult | undefined {
        return this.#airplay.find(d => d.id === deviceId);
    }

    findCompanion(deviceId: string): DiscoveryResult | undefined {
        return this.#companion.find(d => d.id === deviceId);
    }

    findCompanionFor(airplay: DiscoveryResult): DiscoveryResult | undefined {
        return this.#companion.find(d =>
            d.id === airplay.id ||
            d.address === airplay.address ||
            d.fqdn === airplay.fqdn
        );
    }

    async refresh(useCache: boolean = false): Promise<DeviceInfo[]> {
        const [airplay, companion, raop] = await Promise.all([
            Discovery.airplay().find(useCache),
            Discovery.companionLink().find(useCache),
            Discovery.raop().find(useCache)
        ]);

        this.#airplay = airplay;
        this.#companion = companion;
        this.#raop = raop;

        return this.toDeviceInfoList();
    }

    toDeviceInfoList(): DeviceInfo[] {
        const map = new Map<string, DeviceInfo>();

        for (const airplay of this.#airplay) {
            const model = airplay.txt.model ?? '';
            const type = detectDeviceType(model);

            const companion = this.findCompanionFor(airplay);
            const protocols: DeviceProtocol[] = ['airplay'];
            const altIds: string[] = [];

            if (companion) {
                protocols.push('companionLink');
                altIds.push(companion.id);
            }

            const paired = detectPairedProtocols(this.storage, airplay.id, altIds);

            const existing = map.get(airplay.address);
            if (existing && existing.model !== 'Unknown' && !model) {
                continue;
            }

            map.set(airplay.address, {
                id: airplay.id,
                name: airplay.fqdn,
                model: model || 'Unknown',
                address: airplay.address,
                port: airplay.service.port,
                type,
                protocols,
                paired
            });
        }

        const devices = Array.from(map.values());

        if (!SHOW_UNSUPPORTED_DEVICES) {
            return devices.filter(d => d.type !== 'other');
        }

        return devices;
    }

    listPaired(): DeviceInfo[] {
        const stored = this.storage.listDevices();
        const result: DeviceInfo[] = [];

        for (const device of stored) {
            const discovered = this.findAirplay(device.identifier) ?? this.findCompanion(device.identifier);
            const protocols: DeviceProtocol[] = [];
            const paired: DeviceProtocol[] = [];

            for (const protocol of ['airplay', 'companionLink'] as const) {
                if (this.storage.getCredentials(device.identifier, protocol)) {
                    paired.push(protocol);
                }
            }

            if (discovered) {
                if (this.findAirplay(device.identifier)) {
                    protocols.push('airplay');
                }
                if (this.findCompanion(device.identifier)) {
                    protocols.push('companionLink');
                }
            } else {
                for (const protocol of paired) {
                    protocols.push(protocol);
                }
            }

            const model = discovered?.txt.model ?? '';

            result.push({
                id: device.identifier,
                name: device.name,
                model: model || 'Unknown',
                address: discovered?.address ?? '',
                port: discovered?.service.port ?? 0,
                type: detectDeviceType(model),
                protocols,
                paired
            });
        }

        return result;
    }

    clearCache(): void {
        Discovery.clearCache();
    }
}
