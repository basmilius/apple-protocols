import * as AirPlay from '@basmilius/apple-airplay';
import { type Storage } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice, isHomePodDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

    const isAppleTV = isAppleTVDevice(device);
    const isHomePod = isHomePodDevice(device);

    if (!isAppleTV && !isHomePod) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported.`);
        return;
    }

    startSavingLogs();

    const protocol = new AirPlay.Protocol(device);
    await protocol.connect();

    try {
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
    } finally {
        protocol.disconnect();
    }
}
