import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE, mdnsMulticast, mdnsUnicast } from '@basmilius/apple-common';
import { prompt } from 'enquirer';

export default async function (): Promise<void> {
    const modeResponse: Record<string, string> = await prompt({
        name: 'mode',
        type: 'select',
        message: 'Scan mode?',
        choices: [
            { message: 'Multicast (discover all devices)', name: 'multicast' },
            { message: 'Unicast (query specific host)', name: 'unicast' }
        ]
    });

    const services = [AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE];

    console.log();
    console.log('Scanning...');

    let results;

    if (modeResponse.mode === 'unicast') {
        const hostResponse: Record<string, string> = await prompt({
            name: 'host',
            type: 'input',
            message: 'Enter IP address:'
        });

        results = await mdnsUnicast([hostResponse.host], services, 4);
    } else {
        results = await mdnsMulticast(services, 4);
    }

    console.log();
    console.log(`Found ${results.length} services:`);
    console.log();

    for (const service of results) {
        console.log(`  ${service.name}`);
        console.log(`    Type:    ${service.type}`);
        console.log(`    Address: ${service.address}:${service.port}`);

        const propKeys = Object.keys(service.properties);

        if (propKeys.length > 0) {
            console.log(`    Properties:`);

            for (const key of propKeys) {
                console.log(`      ${key} = ${service.properties[key]}`);
            }
        }

        console.log();
    }
}
