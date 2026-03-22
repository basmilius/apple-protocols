import { Url } from '@basmilius/apple-audio-source';
import { TimingServer } from '@basmilius/apple-common';
import { RaopClient } from '@basmilius/apple-raop';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isHomePodDevice } from './shared';

export default async function (): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to play audio on?');

    if (!device) {
        return;
    }

    if (!isHomePodDevice(device)) {
        console.error(`Device ${device.fqdn} (${device.id}) is not supported. Only HomePods can play audio.`);
        return;
    }

    startSavingLogs();

    const timingServer = new TimingServer();
    await timingServer.listen();

    const raop = await RaopClient.create(device, timingServer);
    raop.on('playing', info => console.log(`Playing ${info.metadata.title}`));
    raop.on('stopped', () => console.log('Stopped playing'));

    console.log(`Connected to ${raop.deviceId}`);
    console.log(`Model: ${raop.modelName}`);
    console.log(`Address: ${raop.address}`);

    try {
        const audioSource = await Url.fromUrl('https://bmcdn.nl/doorbell.wav');

        await raop.stream(audioSource, {
            metadata: {
                title: 'Doorbell',
                artist: 'Apple Protocols Diagnostics',
                album: 'Test Audio',
                duration: 5
            },
            volume: 15
        });
    } finally {
        await raop.close();
        timingServer.close();
    }
}
