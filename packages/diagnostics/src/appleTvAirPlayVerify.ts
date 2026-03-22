import * as AirPlay from '@basmilius/apple-airplay';
import { Discovery, type Storage } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const spinner = ora('Searching for AirPlay devices...').start();

    const discovery = Discovery.airplay();
    const devices = await discovery.find();

    if (devices.length === 0) {
        spinner.fail('No AirPlay devices found');
        return;
    }

    spinner.succeed(`Found ${devices.length} AirPlay devices`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message: 'Which device would you like to verify?',
        choices: devices.map(d => ({
            message: d.fqdn,
            name: d.id
        }))
    });

    const device = devices.find(d => d.id === response.device)!;
    const isAppleTV = device.txt.model.startsWith('AppleTV');

    if (!isAppleTV) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported, only Apple TV's can be verified.`);
        return;
    }

    const credentials = getSavedCredentials(storage, device, 'airplay');

    startSavingLogs();

    const protocol = new AirPlay.Protocol(device);
    await protocol.connect();

    try {
        const keys = await protocol.verify.start(credentials);

        console.log('Keys:');
        console.log({
            accessoryToControllerKey: keys.accessoryToControllerKey.toString('hex'),
            controllerToAccessoryKey: keys.controllerToAccessoryKey.toString('hex')
        });
    } finally {
        protocol.disconnect();
    }
}
