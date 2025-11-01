import mdns from 'node-dns-sd';
import { waitFor } from '@/cli';
import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE } from '@/const';

export default class Discovery {
    readonly #service: string;

    constructor(service: string) {
        this.#service = service;
    }

    async find(): Promise<DiscoveryResult[]> {
        return await mdns.discover({
            name: this.#service
        });
    }

    async findUntil(fqdn: string, tries: number = 10, timeout: number = 1000): Promise<DiscoveryResult> {
        while (tries > 0) {
            const devices = await this.find();
            const device = devices.find(device => device.fqdn === fqdn);

            if (device) {
                return device;
            }

            console.log();
            console.log(`Device not found, retrying in ${timeout}ms...`);
            console.log(devices.map(d => ` ● ${d.fqdn}`).join('\n'));

            tries--;

            if (tries === 0) {
                throw new Error('Device not found after serveral tries, aborting.');
            }

            await waitFor(timeout);
        }
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

export type DiscoveryResult = {
    readonly fqdn: string;
    readonly address: string;
    readonly modelName: string;
    readonly familyName: string | null;
    readonly service: {
        readonly port: number;
        readonly protocol: 'tcp' | 'udp';
        readonly type: string;
    };
    readonly packet: {
        readonly address: string;
        readonly header: Record<string, number>;
        readonly questions: Array<any>;
        readonly answers: Array<any>;
        readonly authorities: Array<any>;
        readonly additionals: [];
    };
    readonly [key: string]: unknown;
};
