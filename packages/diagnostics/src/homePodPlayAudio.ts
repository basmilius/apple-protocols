import { Url } from '@basmilius/apple-audio-source';
import { TimingServer } from '@basmilius/apple-common';
import { RaopClient } from '@basmilius/apple-raop';
import { findDevice } from './findDevice';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    const device = await findDevice('airplay', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

    const isHomePod = device.txt.model.startsWith('AudioAccessory');

    if (!isHomePod) {
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

    const audioSource = await Url.fromUrl('https://bmcdn.nl/doorbell.ogg');

    await raop.stream(audioSource, {
        metadata: {
            title: 'Doorbell',
            artist: 'Apple Protocols Diagnostics',
            album: 'Test Audio',
            duration: 5
        },
        volume: 15
    });
}

