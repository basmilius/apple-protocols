import { type Storage } from '@basmilius/apple-common';
import * as CompanionLink from '@basmilius/apple-companion-link';
import { prompt } from 'enquirer';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('companionLink', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

    startSavingLogs();

    const protocol = new CompanionLink.Protocol(device);
    await protocol.connect();

    try {
        await protocol.pairing.start();

        const credentials = await protocol.pairing.pin(async () => prompt({
            name: 'pin',
            type: 'input',
            message: 'Enter PIN'
        }).then((r: Record<string, string>) => r.pin));

        storage.setDevice(device.id, {
            identifier: device.id,
            name: device.fqdn
        });
        storage.setCredentials(device.id, 'companionLink', credentials);
        await storage.save();

        console.log('Credentials saved.');
    } finally {
        protocol.disconnect();
    }
}
