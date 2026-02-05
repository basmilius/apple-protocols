import mdns, { DiscoveryResult, DnsRecord, Result } from 'node-dns-sd';
import { waitFor } from './cli';
import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE } from './const';

export class Discovery {
    readonly #service: string;

    constructor(service: string) {
        this.#service = service;
    }

    async find(): Promise<DiscoveryResult[]> {
        const results = await mdns.discover({
            name: this.#service
        });

        return results.map(result => ({
            id: generateId(result) ?? result.fqdn,
            txt: getTxt(result),
            ...result
        }));
    }

    async findUntil(id: string, tries: number = 10, timeout: number = 1000): Promise<DiscoveryResult> {
        while (tries > 0) {
            const devices = await this.find();
            const device = devices.find(device => device.id === id);

            if (device) {
                return device;
            }

            console.log();
            console.log(`Device not found, retrying in ${timeout}ms...`);
            console.log(devices.map(d => ` ● ${d.id}`).join('\n'));

            tries--;

            await waitFor(timeout);
        }

        throw new Error('Device not found after serveral tries, aborting.');
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

function generateId(result: Result): string | null {
    if (!result?.packet) {
        return null;
    }

    const {answers = [], additionals = []} = result.packet;
    const allRecords = [...answers, ...additionals];

    // Strategy 1: Find SRV record and get the target (most reliable)
    const srvRecord = allRecords.find((record) => record.type === 'SRV');
    if (srvRecord?.rdata?.target) {
        return srvRecord.rdata.target;
    }

    // Strategy 2: Find A or AAAA record name that matches the IP address
    // (the record name is the hostname)
    if (result.address) {
        const addressRecord = allRecords.find(record => (record.type === 'A' || record.type === 'AAAA') && record.rdata === result.address);

        if (addressRecord?.name) {
            return addressRecord.name;
        }
    }

    // Strategy 3: Find any A record and use its name as hostname
    const aRecord = allRecords.find((record) => record.type === 'A');
    if (aRecord?.name) {
        return aRecord.name;
    }

    // Strategy 4: Fallback - derive from fqdn/modelName (less reliable)
    if (result.modelName) {
        const hostname = result.modelName
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9-]/g, '');

        return `${hostname}.local`;
    }

    return null;
}

function getTxt(result: Result): Record<string, string> {
    if (!result.packet) {
        return {};
    }

    const {answers = [], additionals = []} = result.packet;
    const records: DnsRecord[] = [
        ...answers,
        ...additionals
    ];

    const txt: Record<string, string> = {};

    for (const record of records) {
        if (record.type === 'TXT' && record.rdata) {
            Object.assign(txt, record.rdata);
        }
    }

    return txt;
}
