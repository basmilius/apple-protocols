import { Discovery } from '@basmilius/apple-common';
import * as CompanionLink from '@basmilius/apple-companion-link';
import { write } from 'bun';
import { prompt } from 'enquirer';
import ora from 'ora';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const spinner = ora('Searching for Companion Link devices...').start();

    const discovery = Discovery.companionLink();
    const devices = await discovery.find();

    if (devices.length === 0) {
        spinner.fail('No Companion Link devices found');
        return;
    }

    spinner.succeed(`Found ${devices.length} Companion Link devices`);

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

    console.log('Credentials:');
    console.log({
        accessoryIdentifier: credentials.accessoryIdentifier,
        accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
        pairingId: credentials.pairingId.toString('hex'),
        publicKey: credentials.publicKey.toString('hex'),
        secretKey: credentials.secretKey.toString('hex')
    });

    await write(`${device.fqdn}.ap-creds`, JSON.stringify({
        accessoryIdentifier: credentials.accessoryIdentifier,
        accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
        pairingId: credentials.pairingId.toString('hex'),
        publicKey: credentials.publicKey.toString('hex'),
        secretKey: credentials.secretKey.toString('hex')
    }));
}
