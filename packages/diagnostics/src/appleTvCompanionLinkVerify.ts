import * as CompanionLink from '@basmilius/apple-companion-link';
import { findDevice } from './findDevice';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    const device = await findDevice('companion-link', 'Which device would you like to verify?');

    if (!device) {
        return;
    }

    const isAppleTV = device.txt.model.startsWith('AppleTV');

    if (!isAppleTV) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported, only Apple TV's can be verified.`);
        return;
    }

    const credentials = await getSavedCredentials(device);

    startSavingLogs();

    const protocol = new CompanionLink.Protocol(device);
    await protocol.connect();

    const keys = await protocol.verify.start(credentials);

    console.log('Keys:');
    console.log({
        accessoryToControllerKey: keys.accessoryToControllerKey.toString('hex'),
        controllerToAccessoryKey: keys.controllerToAccessoryKey.toString('hex')
    });
}

