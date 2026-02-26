import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';

export async function findDevice(type: 'airplay' | 'companion-link', message: string): Promise<DiscoveryResult | null> {
    const typeName = type === 'airplay' ? 'AirPlay' : 'Companion Link';

    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const spinner = ora(`Searching for ${typeName} devices...`).start();

    const discovery = type === 'airplay' ? Discovery.airplay() : Discovery.companionLink();
    const devices = await discovery.find();

    if (devices.length === 0) {
        spinner.fail(`No ${typeName} devices found`);
        return null;
    }

    spinner.succeed(`Found ${devices.length} ${typeName} devices`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message,
        choices: devices.map(d => ({
            message: d.fqdn,
            name: d.id
        }))
    });

    return devices.find(d => d.id === response.device) ?? null;
}
