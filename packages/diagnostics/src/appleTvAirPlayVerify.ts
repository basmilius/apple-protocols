import * as AirPlay from '@basmilius/apple-airplay';
import { type Storage } from '@basmilius/apple-common';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to verify?');

    if (!device) {
        return;
    }

    if (!isAppleTVDevice(device)) {
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
