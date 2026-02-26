import * as CompanionLink from '@basmilius/apple-companion-link';
import { prompt } from 'enquirer';
import { findDevice } from './findDevice';
import { saveCredentials } from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    const device = await findDevice('companion-link', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

    const isAppleTV = device.txt.model.startsWith('AppleTV');

    if (!isAppleTV) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported.`);
        return;
    }

    startSavingLogs();

    const protocol = new CompanionLink.Protocol(device);
    await protocol.connect();
    await protocol.pairing.start();

    const credentials = await protocol.pairing.pin(async () => prompt({
        name: 'pin',
        type: 'input',
        message: 'Enter PIN'
    }).then((r: Record<string, string>) => r.pin));

    await saveCredentials(device, credentials);
}

