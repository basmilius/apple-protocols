import { Url } from '@basmilius/apple-audio-source';
import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, type Storage, TimingServer } from '@basmilius/apple-common';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to stream to?');

    if (!device) {
        return;
    }

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

    console.log('Setting up event stream...');
    await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

    const feedbackInterval = setInterval(() => protocol.feedback(), 2000);

    console.log('Setting volume...');
    await protocol.controlStream.setParameter('volume', '-20');

    console.log('Loading audio source...');
    const audioSource = await Url.fromUrl('https://bmcdn.nl/doorbell.wav');

    console.log('Starting AirPlay 2 audio stream...');
    await protocol.setupAudioStream(audioSource);

    console.log('Streaming complete.');

    clearInterval(feedbackInterval);
    protocol.disconnect();
    timingServer.close();
}
