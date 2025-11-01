import mdns, { Result } from 'node-dns-sd';
import { waitFor } from '@/cli';
import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE } from '@/const';

export default class Discovery {
    readonly #service: string;

    constructor(service: string) {
        this.#service = service;
    }

    async find(): Promise<Result[]> {
        return await mdns.discover({
            name: this.#service
        });
    }

    async findUntil(fqdn: string, tries: number = 10, timeout: number = 1000): Promise<Result> {
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
