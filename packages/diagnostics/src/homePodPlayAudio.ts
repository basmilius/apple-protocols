import { Url } from '@basmilius/apple-audio-source';
import { Discovery, TimingServer } from '@basmilius/apple-common';
import { RaopClient } from '@basmilius/apple-raop';
import { prompt } from 'enquirer';
import ora from 'ora';
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
