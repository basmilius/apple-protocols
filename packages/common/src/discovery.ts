import { createConnection } from 'node:net';
import { parseFeatures } from './airplayFeatures';
import { waitFor } from './cli';
import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE } from './const';
import { DiscoveryError } from './errors';
import { multicast, type MdnsService } from './mdns';
import { Logger } from './reporter';
import type { CombinedDiscoveryResult, DiscoveryResult } from './types';

type CacheEntry = {
    results: DiscoveryResult[];
    expiresAt: number;
};

const CACHE_TTL = 30_000;
const WAKE_PORTS = [7000, 3689, 49152, 32498];

const toDiscoveryResult = (service: MdnsService): DiscoveryResult => {
    const txt = service.properties;
    const featuresStr = txt.features ?? txt.ft;
    const model = txt.model ?? txt.am ?? '';
    const protocol = service.type.includes('._tcp') ? 'tcp' as const : 'udp' as const;

    const hostname = service.name.replace(/\s+/g, '-');

    return {
        id: `${hostname}.local`,
        fqdn: `${hostname}.local`,
        address: service.address,
        modelName: model,
        familyName: null,
        txt,
        features: featuresStr ? tryParseFeatures(featuresStr) : undefined,
        service: {
            port: service.port,
            protocol,
            type: service.type
        },
        packet: null as any
    };
};

const tryParseFeatures = (features: string): bigint | undefined => {
    try {
        return parseFeatures(features);
    } catch {
        return undefined;
    }
};

const logger = new Logger('discovery');

export class Discovery {
    static #cache: Map<string, CacheEntry> = new Map();

    readonly #service: string;

    constructor(service: string) {
        this.#service = service;
    }

    async find(useCache: boolean = true): Promise<DiscoveryResult[]> {
        if (useCache) {
            const cached = Discovery.#cache.get(this.#service);

            if (cached && cached.expiresAt > Date.now()) {
                return cached.results;
            }
        }

        // Verwijder verlopen cache entries.
        const now = Date.now();

        for (const [key, entry] of Discovery.#cache) {
            if (entry.expiresAt <= now) {
                Discovery.#cache.delete(key);
            }
        }

        const services = await multicast([this.#service], 4);
        const mapped = services.map(toDiscoveryResult);

        Discovery.#cache.set(this.#service, {
            results: mapped,
            expiresAt: Date.now() + CACHE_TTL
        });

        return mapped;
    }

    async findUntil(id: string, tries: number = 10, timeout: number = 1000): Promise<DiscoveryResult> {
        while (tries > 0) {
            const devices = await this.find(false);
            const device = devices.find(device => device.id === id);

            if (device) {
                return device;
            }

            logger.debug(`Device '${id}' not found, retrying in ${timeout}ms...`, devices.map(d => d.id));

            tries--;

            await waitFor(timeout);
        }

        throw new DiscoveryError(`Device '${id}' not found after several tries, aborting.`);
    }

    static clearCache(): void {
        Discovery.#cache.clear();
    }

    static async wake(address: string): Promise<void> {
        const promises = WAKE_PORTS.map(port => new Promise<void>((resolve) => {
            const socket = createConnection({ host: address, port, timeout: 500 });
            socket.on('connect', () => { socket.destroy(); resolve(); });
            socket.on('error', () => { socket.destroy(); resolve(); });
            socket.on('timeout', () => { socket.destroy(); resolve(); });
        }));

        await Promise.all(promises);
    }

    static async discoverAll(): Promise<CombinedDiscoveryResult[]> {
        const allServices = await multicast([AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE], 4);
        const devices = new Map<string, CombinedDiscoveryResult>();

        for (const service of allServices) {
            const result = toDiscoveryResult(service);
            const existing = devices.get(result.id);

            if (existing) {
                if (service.type === AIRPLAY_SERVICE) {
                    existing.airplay = result;
                } else if (service.type === COMPANION_LINK_SERVICE) {
                    existing.companionLink = result;
                } else if (service.type === RAOP_SERVICE) {
                    existing.raop = result;
                }
            } else {
                devices.set(result.id, {
                    id: result.id,
                    name: result.fqdn,
                    address: result.address,
                    airplay: service.type === AIRPLAY_SERVICE ? result : undefined,
                    companionLink: service.type === COMPANION_LINK_SERVICE ? result : undefined,
                    raop: service.type === RAOP_SERVICE ? result : undefined
                });
            }
        }

        return [...devices.values()];
    }

    static airplay(): Discovery {
        return new Discovery(AIRPLAY_SERVICE);
    }

    static companionLink(): Discovery {
        return new Discovery(COMPANION_LINK_SERVICE);
    }

    static raop(): Discovery {
        return new Discovery(RAOP_SERVICE);
    }
}
