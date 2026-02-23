import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, Discovery, TimingServer } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
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

    const timingServer = new TimingServer();
    await timingServer.listen();

    const protocol = new AirPlay.Protocol(device);
    await protocol.connect();

    let keys: AccessoryKeys | undefined;

    if (isAppleTV) {
        const credentials = await getSavedCredentials(device);
        keys = await protocol.verify.start(credentials);
    }

    if (isHomePod) {
        keys = await protocol.pairing.transient();
    }

    if (!keys) {
        console.error('No keys found.');
        return;
    }

    console.log('Keys:');
    console.log({
        accessoryToControllerKey: keys.accessoryToControllerKey.toString('hex'),
        controllerToAccessoryKey: keys.controllerToAccessoryKey.toString('hex')
    });

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    protocol.useTimingServer(timingServer);

    await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
    await protocol.setupDataStream(keys.sharedSecret);

    setInterval(() => protocol.feedback(), 2000);

    protocol.dataStream.once('deviceInfo', async () => {
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setConnectionState());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.clientUpdatesConfig());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setReadyState());
    });

    await protocol.dataStream.exchange(AirPlay.DataStreamMessage.deviceInfo(keys.pairingId));
}
