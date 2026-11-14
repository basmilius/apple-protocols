import { DiscoveryError } from '../errors';
import { Logger } from '../reporter';
import { waitFor } from '../utils';
import { knock, type MdnsService, mdnsMulticast, mdnsUnicast } from './mdns';
import type { DiscoveryResult } from './types';

type CacheEntry = {
    results: DiscoveryResult[];
    expiresAt: number;
};

const CACHE_TTL = 30_000;

const logger = new Logger('discovery');

/**
 * mDNS service discovery for any service type. Which service type a protocol advertises, and what
 * its TXT record means, is the knowledge of that protocol's package.
 *
 * Results are cached for 30 seconds per service type, and concurrent scans for the same set of
 * types share one multicast query. The cache is shared by all instances on purpose: protocol
 * packages and `@corewire/devices` scan through separate instances but should not flood the
 * network with one query each.
 */
export class Discovery {
    static #cache: Map<string, CacheEntry> = new Map();
    static #scans = new Map<string, Promise<Map<string, DiscoveryResult[]>>>();

    get service(): string {
        return this.#service;
    }

    readonly #service: string;

    /** @param service - The mDNS service type, e.g. '_hap._tcp.local'. */
    constructor(service: string) {
        this.#service = service;
    }

    async find(useCache: boolean = true): Promise<DiscoveryResult[]> {
        const now = performance.now();

        for (const [key, entry] of Discovery.#cache) {
            if (entry.expiresAt <= now) {
                Discovery.#cache.delete(key);
            }
        }

        return (await Discovery.findServices([this.#service], useCache)).get(this.#service)!;
    }

    /**
     * Scans again until a device with this id answers. Skips the cache on every attempt.
     *
     * @param timeout - Delay in milliseconds between attempts.
     * @throws {DiscoveryError} If the device does not answer within `tries` attempts.
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

    /**
     * Queries one host with unicast DNS-SD, bypassing the cache.
     *
     * @param timeout - Discovery duration in seconds.
     * @param wakePorts - Ports to knock on first, to wake a sleeping device.
     */
    async findByAddress(address: string, timeout: number = 4, wakePorts: readonly number[] = []): Promise<DiscoveryResult | null> {
        const services = await mdnsUnicast([address], [this.#service], timeout, wakePorts);
        const match = services.find(service => service.address === address);

        return match ? toDiscoveryResult(match) : null;
    }

    /** One multicast scan, and one in-flight operation, for a group of service types. */
    static async findServices(services: readonly string[], useCache: boolean = true): Promise<Map<string, DiscoveryResult[]>> {
        const result = new Map<string, DiscoveryResult[]>();
        const missing = [...new Set(services)].filter(service => {
            const cached = Discovery.#cache.get(service);

            if (useCache && cached && cached.expiresAt > performance.now()) {
                result.set(service, cached.results);

                return false;
            }

            return true;
        }).sort();

        if (missing.length === 0) {
            return result;
        }

        const key = missing.join(',');
        let scan = Discovery.#scans.get(key);

        if (!scan) {
            scan = mdnsMulticast(missing, 4).then(records => {
                const found = new Map<string, DiscoveryResult[]>();

                for (const service of missing) {
                    const results = records.filter(record => record.type === service || `${record.type}.local` === service).map(toDiscoveryResult);
                    found.set(service, results);
                    Discovery.#cache.set(service, {results, expiresAt: performance.now() + CACHE_TTL});
                }

                return found;
            }).finally(() => Discovery.#scans.delete(key));

            Discovery.#scans.set(key, scan);
        }

        for (const [service, records] of await scan) {
            result.set(service, records);
        }

        return result;
    }

    static clearCache(): void {
        Discovery.#cache.clear();
    }

    /** Knocks on each port to wake a sleeping device. */
    static wake(address: string, ports: readonly number[]): Promise<void> {
        return knock(address, ports);
    }
}

function toDiscoveryResult(service: MdnsService): DiscoveryResult {
    const txt = service.properties;
    const hostname = service.name.replace(/\s+/g, '-');

    return {
        id: `${hostname}.local`,
        fqdn: `${hostname}.local`,
        address: service.address,
        txt,
        service: {
            port: service.port,
            protocol: service.type.includes('._tcp') ? 'tcp' : 'udp',
            type: service.type
        }
    };
}
