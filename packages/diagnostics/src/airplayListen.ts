import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, type Storage, TimingServer } from '@basmilius/apple-common';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice, isHomePodDevice } from './shared';

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to listen to?');

    if (!device) {
        return;
    }

    const isAppleTV = isAppleTVDevice(device);
    const isHomePod = isHomePodDevice(device);

    if (!isAppleTV && !isHomePod) {
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
        const credentials = getSavedCredentials(storage, device, 'airplay');
        keys = await protocol.verify.start(credentials);
    }

    if (isHomePod) {
        keys = await protocol.pairing.transient();
    }

    if (!keys) {
        console.error('No keys found.');
        protocol.disconnect();
        timingServer.close();
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

    const feedbackInterval = setInterval(() => protocol.feedback(), 2000);

    protocol.dataStream.once('deviceInfo', async () => {
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setConnectionState());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.clientUpdatesConfig());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setReadyState());
    });

    await protocol.dataStream.exchange(AirPlay.DataStreamMessage.deviceInfo(keys.pairingId));

    // Wait until the user presses Enter to stop listening.
    await new Promise<void>(resolve => {
        console.log();
        console.log('Listening for events... Press Enter to stop.');
        process.stdin.once('data', () => resolve());
    });

    clearInterval(feedbackInterval);
    protocol.disconnect();
    timingServer.close();
}
