import * as AirPlay from '@basmilius/apple-airplay';
import { Discovery, type Storage } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';
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
        message: 'Which device would you like to pair?',
        choices: devices.map(d => ({
            message: d.fqdn,
            name: d.id
        }))
    });

    const device = devices.find(d => d.id === response.device)!;
    const isAppleTV = device.txt.model.startsWith('AppleTV');
    const isHomePod = device.txt.model.startsWith('AudioAccessory');
    const isSupported = isAppleTV || isHomePod;

    if (!isSupported) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported.`);
        return;
    }

    startSavingLogs();

    const protocol = new AirPlay.Protocol(device);
    await protocol.connect();
    await protocol.pairing.start();

    if (isAppleTV) {
        const credentials = await protocol.pairing.pin(async () => prompt({
            name: 'pin',
            type: 'input',
            message: 'Enter PIN'
        }).then((r: Record<string, string>) => r.pin));

        storage.setDevice(device.id, {
            identifier: device.id,
            name: device.fqdn
        });
        storage.setCredentials(device.id, 'airplay', credentials);
        await storage.save();

        console.log('Credentials saved.');
    }

    if (isHomePod) {
        const keys = await protocol.pairing.transient();

        console.log('Keys:');
        console.log({
            accessoryToControllerKey: keys.accessoryToControllerKey.toString('hex'),
            controllerToAccessoryKey: keys.controllerToAccessoryKey.toString('hex')
        });
    }
}
