import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, type Storage, TimingServer } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to play on?');

    if (!device) {
        return;
    }

    const urlResponse: Record<string, string> = await prompt({
        name: 'url',
        type: 'input',
        message: 'Enter the URL to play:'
    });

    const url = urlResponse.url;
    const isAppleTV = isAppleTVDevice(device);

    startSavingLogs();

    const timingServer = new TimingServer();
    await timingServer.listen();

    const protocol = new AirPlay.Protocol(device);
    protocol.useTimingServer(timingServer);

    console.log('Connecting...');
    await protocol.connect();

    let keys: AccessoryKeys | undefined;

    if (isAppleTV) {
        const credentials = getSavedCredentials(storage, device, 'airplay');
        keys = await protocol.verify.start(credentials);
    } else {
        await protocol.pairing.start();
        keys = await protocol.pairing.transient();
    }

    if (!keys) {
        console.error('No keys found.');
        return;
    }

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    const feedbackInterval = setInterval(() => protocol.feedback(), 2000);

    console.log(`Playing ${url}...`);

    try {
        await protocol.playUrl(url, keys.sharedSecret, keys.pairingId);
        console.log('Playback started. Press Control-C to stop.');
    } catch (err) {
        console.error('Failed to play URL:', err);
        clearInterval(feedbackInterval);
        protocol.disconnect();
        timingServer.close();
    }
}
