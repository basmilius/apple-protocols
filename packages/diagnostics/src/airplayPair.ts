import * as AirPlay from '@basmilius/apple-airplay';
import { prompt } from 'enquirer';
import { findDevice } from './findDevice';
import { saveCredentials } from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    const device = await findDevice('airplay', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

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

        await saveCredentials(device, credentials);
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

