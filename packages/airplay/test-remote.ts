import { Discovery, prompt, reporter, waitFor } from '@basmilius/apple-common';
import * as AirPlay from './src';

reporter.all();

async function homepod(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Slaapkamer-HomePod.local');
    const protocol = new AirPlay.Protocol(discoveryResult);

    await protocol.connect();

    await protocol.pairing.start();
    const keys = await protocol.pairing.transient();

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
    await protocol.setupDataStream(keys.sharedSecret);

    setInterval(() => protocol.feedback(), 2000);

    protocol.dataStream.once('deviceInfo', async () => {
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setConnectionState());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.clientUpdatesConfig());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setReadyState());

        await waitFor(3000);

    });

    await protocol.dataStream.exchange(AirPlay.DataStreamMessage.deviceInfo(keys.pairingId, protocol.context.identity));
}

async function tv(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');
    const protocol = new AirPlay.Protocol(discoveryResult);

    await protocol.connect();

    const keys = await protocol.verify.start({
        accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
        accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
        pairingId: Buffer.from('32373938444337422d433646352d343643332d384346382d323034443938353338333734', 'hex'),
        publicKey: Buffer.from('385ae55433ebee4acfba7b1a12ce1cccafea37bd49f86b21691741a647a071ec', 'hex'),
        secretKey: Buffer.from('0be84946aabcca3c99471791b32a64b83eb5c4f8edb62e1535c69507d7720296385ae55433ebee4acfba7b1a12ce1cccafea37bd49f86b21691741a647a071ec', 'hex')
    });

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
    await protocol.setupDataStream(keys.sharedSecret);

    setInterval(() => protocol.feedback(), 2000);

    protocol.dataStream.addListener('deviceInfo', async message => {
        let outputUID: string;

        if (message.clusterID) {
            outputUID = message.clusterID;
        } else if (message.deviceUID) {
            outputUID = message.deviceUID;
        } else if (message.uniqueIdentifier) {
            outputUID = message.uniqueIdentifier;
        } else {
            outputUID = 'unknown';
        }

        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.setConnectionState());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.clientUpdatesConfig());
        await protocol.dataStream.exchange(AirPlay.DataStreamMessage.getVolume(outputUID));
    });

    await protocol.dataStream.exchange(AirPlay.DataStreamMessage.deviceInfo(keys.pairingId, protocol.context.identity));
}

async function tvPair(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');
    const protocol = new AirPlay.Protocol(discoveryResult);

    await protocol.connect();
    await protocol.pairing.start();

    const credentials = await protocol.pairing.pin(async () => await prompt('Enter PIN'));

    console.log({
        accessoryIdentifier: credentials.accessoryIdentifier,
        accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
        pairingId: credentials.pairingId.toString('hex'),
        publicKey: credentials.publicKey.toString('hex'),
        secretKey: credentials.secretKey.toString('hex')
    });
}

const what = process.argv[2] ?? null;

switch (what) {
    case 'homepod':
        await homepod();
        break;

    case 'tv':
        await tv();
        break;

    case 'tvPair':
        await tvPair();
        break;

    default:
        console.error(`Unknown test ${what}, please use specify either homepod, tv or tvPair.`);
        break;
}
