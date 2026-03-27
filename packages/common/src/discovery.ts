import { parseFeatures } from './airplayFeatures';
import { waitFor } from './cli';
import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE } from './const';
import { DiscoveryError } from './errors';
import { knock, multicast, type MdnsService } from './mdns';
import { Logger } from './reporter';
import type { CombinedDiscoveryResult, DiscoveryResult } from './types';

/** A cached set of discovery results with an expiration timestamp. */
type CacheEntry = {
    results: DiscoveryResult[];
    expiresAt: number;
};

/** Cache time-to-live in milliseconds. */
const CACHE_TTL = 30_000;

/**
 * Converts a raw mDNS service record into a {@link DiscoveryResult}.
 *
 * @param service - The mDNS service record.
 * @returns A normalized discovery result.
 */
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

/**
 * Safely parses a features string, returning undefined on failure.
 *
 * @param features - The features string to parse.
 * @returns The parsed feature bitmask, or undefined if parsing fails.
 */
const tryParseFeatures = (features: string): bigint | undefined => {
    try {
        return parseFeatures(features);
    } catch {
        return undefined;
    }
};

const logger = new Logger('discovery');

/**
 * mDNS service discovery for Apple devices on the local network.
 *
 * Supports discovering AirPlay, Companion Link, and RAOP services via multicast DNS.
 * Results are cached for 30 seconds to avoid excessive network traffic.
 * Use the static factory methods {@link Discovery.airplay}, {@link Discovery.companionLink},
 * and {@link Discovery.raop} for convenience.
 */
export class Discovery {
    /** Shared cache of discovery results, keyed by service type. */
    static #cache: Map<string, CacheEntry> = new Map();

    readonly #service: string;

    /**
     * @param service - The mDNS service type to discover (e.g. '_airplay._tcp.local').
     */
    constructor(service: string) {
        this.#service = service;
    }

    /**
     * Discovers devices advertising this service type via mDNS multicast.
     * Returns cached results if available and not expired.
     *
     * @param useCache - Whether to use cached results. Defaults to true.
     * @returns An array of discovered devices.
     */
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

    /**
     * Repeatedly searches for a specific device by ID until found or retries are exhausted.
     * Does not use the cache to ensure fresh results on each attempt.
     *
     * @param id - The device ID to search for.
     * @param tries - Maximum number of discovery attempts. Defaults to 10.
     * @param timeout - Delay in milliseconds between attempts. Defaults to 1000.
     * @returns The discovered device.
     * @throws {DiscoveryError} If the device is not found after all attempts.
     */
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

    /** Clears all cached discovery results across all service types. */
    static clearCache(): void {
        Discovery.#cache.clear();
    }

    /**
     * Attempts to wake a sleeping Apple device by knocking on well-known ports.
     * Sends TCP connection attempts to ports 7000, 3689, 49152, and 32498.
     *
     * @param address - The IP address of the device to wake.
     */
    static wake(address: string): Promise<void> {
        return knock(address);
    }

    /**
     * Discovers all Apple devices on the network across all supported service types
     * (AirPlay, Companion Link, RAOP) and merges them by device ID.
     *
     * @returns An array of combined results, each representing a single physical device
     *          with its available service endpoints.
     */
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

    /**
     * Creates a Discovery instance for AirPlay services.
     *
     * @returns A new Discovery instance targeting `_airplay._tcp.local`.
     */
    static airplay(): Discovery {
        return new Discovery(AIRPLAY_SERVICE);
    }

    /**
     * Creates a Discovery instance for Companion Link services.
     *
     * @returns A new Discovery instance targeting `_companion-link._tcp.local`.
     */
    static companionLink(): Discovery {
        return new Discovery(COMPANION_LINK_SERVICE);
    }

    /**
     * Creates a Discovery instance for RAOP services.
     *
     * @returns A new Discovery instance targeting `_raop._tcp.local`.
     */
    static raop(): Discovery {
        return new Discovery(RAOP_SERVICE);
    }
}
