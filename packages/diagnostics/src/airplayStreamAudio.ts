import { Url } from '@basmilius/apple-audio-source';
import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, Discovery, type Storage, TimingServer } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (storage: Storage): Promise<void> {
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
        message: 'Which device would you like to stream to?',
        choices: devices.map(d => ({
            message: d.fqdn,
            name: d.id
        }))
    });

    const device = devices.find(d => d.id === response.device)!;
    const isAppleTV = device.txt.model?.startsWith('AppleTV');
    const isHomePod = device.txt.model?.startsWith('AudioAccessory');

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
