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
    await protocol.fetchInfo();

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

    console.log(`Playing ${url}...`);

    try {
        await protocol.playUrl(url, keys.sharedSecret, keys.pairingId);
        console.log('Playback started. Monitoring status...');

        // Poll playback info while playing.
        const pollInterval = setInterval(async () => {
            const info = await protocol.getPlaybackInfo();

            if (info) {
                const parts: string[] = [];

                if (info.duration !== undefined) {
                    const pos = info.position ?? 0;
                    const dur = info.duration;
                    const pct = dur > 0 ? Math.round((pos / dur) * 100) : 0;
                    parts.push(`${pos.toFixed(1)}s / ${dur.toFixed(1)}s (${pct}%)`);
                }

                if (info.rate !== undefined) {
                    parts.push(`rate=${info.rate}`);
                }

                if (parts.length > 0) {
                    console.log(`  [playback] ${parts.join(' | ')}`);
                }
            }
        }, 2000);

        await protocol.waitForPlaybackEnd();

        clearInterval(pollInterval);
        console.log('Playback finished.');
    } catch (err) {
        console.error('Playback error:', err);
    } finally {
        protocol.stopPlayUrl();
        protocol.disconnect();
        timingServer.close();
    }
}
