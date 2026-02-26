import * as AirPlay from '@basmilius/apple-airplay';
import { type AccessoryKeys, TimingServer } from '@basmilius/apple-common';
import { findDevice } from './findDevice';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';

export default async function (): Promise<void> {
    const device = await findDevice('airplay', 'Which device would you like to pair?');

    if (!device) {
        return;
    }

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

