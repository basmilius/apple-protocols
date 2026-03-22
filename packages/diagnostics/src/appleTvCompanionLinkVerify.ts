import { type Storage } from '@basmilius/apple-common';
import * as CompanionLink from '@basmilius/apple-companion-link';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('companionLink', 'Which device would you like to verify?');

    if (!device) {
        return;
    }
    const credentials = getSavedCredentials(storage, device, 'companionLink');

    startSavingLogs();

    const protocol = new CompanionLink.Protocol(device);
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
