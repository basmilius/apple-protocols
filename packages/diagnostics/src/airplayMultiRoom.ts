import * as AirPlay from '@basmilius/apple-airplay';
import { Url } from '@basmilius/apple-audio-source';
import { type AccessoryKeys, Context, Discovery, type DiscoveryResult, type Storage, TimingServer } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { isAppleTVDevice } from './shared';

type PreparedDevice = {
    discoveryResult: DiscoveryResult;
    protocol: AirPlay.Protocol;
    keys: AccessoryKeys;
    feedbackInterval: NodeJS.Timeout;
};

async function prepareDevice(
    storage: Storage,
    discoveryResult: DiscoveryResult,
    timingServer: TimingServer
): Promise<PreparedDevice> {
    const isAppleTV = isAppleTVDevice(discoveryResult);

    const protocol = new AirPlay.Protocol(discoveryResult);
    protocol.useTimingServer(timingServer);

    await protocol.connect();
    await protocol.fetchInfo();

    let keys: AccessoryKeys;

    if (isAppleTV) {
        const credentials = getSavedCredentials(storage, discoveryResult, 'airplay');
        keys = await protocol.verify.start(credentials);
    } else {
        await protocol.pairing.start();
        keys = await protocol.pairing.transient();
    }

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

    const feedbackInterval = setInterval(() => {
        protocol.feedback().catch(err => {
            context.logger.debug('[airplay-multi-room]', 'Ignoring feedback error.', err);
        });
    }, 2000);

    await protocol.controlStream.setParameter('volume', '-20');

    return {discoveryResult, protocol, keys, feedbackInterval};
}

export default async function (storage: Storage): Promise<void> {
    console.log('This tool streams audio to multiple AirPlay devices simultaneously.');
    console.log('Select two or more devices for multi-room playback.');
    console.log();

    const spinner = ora('Searching for AirPlay devices...').start();
    const devices = await Discovery.airplay().find();

    if (devices.length < 2) {
        spinner.fail(`Need at least 2 devices, found ${devices.length}`);
        return;
    }

    spinner.succeed(`Found ${devices.length} AirPlay devices`);

    const response: Record<string, string[]> = await prompt({
        name: 'devices',
        type: 'multiselect',
        message: 'Select devices for multi-room (Space to toggle, Enter to confirm):',
        choices: devices.map(d => ({
            message: d.fqdn,
            name: d.id,
            value: d.id
        }))
    });

    const selectedIds = response.devices;

    if (selectedIds.length < 2) {
        console.error('Select at least 2 devices for multi-room.');
        return;
    }

    const selectedDevices = devices.filter(d => selectedIds.includes(d.id));

    const urlResponse: Record<string, string> = await prompt({
        name: 'url',
        type: 'input',
        message: 'Audio URL to stream:',
        initial: 'https://bmcdn.nl/doorbell.wav'
    });

    startSavingLogs();

    const timingServer = new TimingServer();
    await timingServer.listen();

    const context = new Context('multi-room');
    const multiplexer = new AirPlay.AudioMultiplexer(context);
    const prepared: PreparedDevice[] = [];

    try {
        // Connect to all devices in parallel.
        console.log();
        const connectSpinner = ora(`Connecting to ${selectedDevices.length} devices...`).start();

        const results = await Promise.allSettled(
            selectedDevices.map(async (d) => {
                const dev = await prepareDevice(storage, d, timingServer);
                prepared.push(dev);
                return dev;
            })
        );

        const failed = results.filter(r => r.status === 'rejected');

        if (failed.length > 0) {
            connectSpinner.warn(`Connected to ${prepared.length}/${selectedDevices.length} devices (${failed.length} failed)`);

            for (const f of failed) {
                console.error(`  Failed: ${(f as PromiseRejectedResult).reason}`);
            }
        } else {
            connectSpinner.succeed(`Connected to ${prepared.length} devices`);
        }

        if (prepared.length < 2) {
            console.error('Need at least 2 connected devices.');
            return;
        }

        // Add all protocols as targets.
        for (const dev of prepared) {
            multiplexer.addTarget(dev.protocol);
            console.log(`  + ${dev.discoveryResult.fqdn}`);
        }

        // Load audio.
        console.log();
        console.log(`Loading audio from ${urlResponse.url}...`);
        const audioSource = await Url.fromUrl(urlResponse.url);
        console.log(`  Duration: ${audioSource.duration.toFixed(1)}s`);

        // Stream.
        console.log();
        console.log(`Streaming to ${prepared.length} devices...`);
        await multiplexer.stream(audioSource);

        console.log('Multi-room stream complete.');
    } catch (err) {
        console.error('Multi-room stream error:', err);
    } finally {
        multiplexer.clear();

        for (const dev of prepared) {
            clearInterval(dev.feedbackInterval);
            dev.protocol.disconnect();
        }

        timingServer.close();
    }
}
