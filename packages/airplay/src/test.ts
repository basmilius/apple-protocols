import { Discovery, prompt, reporter, TimingServer } from '@basmilius/apple-common';
import { create } from '@bufbuild/protobuf';
import { AirPlay } from './protocol';
import * as Proto from './proto';

reporter.all();

async function homepod(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Woonkamer HomePod._airplay._tcp.local');
    const protocol = new AirPlay(discoveryResult);

    await protocol.connect();

    await protocol.pairing.start();
    const keys = await protocol.pairing.transient();

    await protocol.rtsp.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupTimingServer(new TimingServer());
    await protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
    await protocol.setupDataStream(keys.sharedSecret);

    setInterval(() => protocol.feedback(), 2000);

    // await protocol.dataStream.exchange(protocol.dataStream.messages.configureConnection(``));
    await protocol.dataStream.exchange(protocol.dataStream.messages.deviceInfo(keys.pairingId));

    protocol.dataStream.addListener('deviceInfo', async () => {
        await protocol.dataStream.exchange(protocol.dataStream.messages.setConnectionState());
        await protocol.dataStream.exchange(protocol.dataStream.messages.clientUpdatesConfig());

        // await waitFor(1000);
        //
        // const response = await protocol.rtsp.post('/play', Buffer.from(serializeBinaryPlist({
        //     'Content-Location': 'https://bmcdn.nl/doorbell.ogg',
        //     'Start-Position-Seconds': 0,
        //     'uuid': uuid().toUpperCase(),
        //     'streamType': 1,
        //     'mediaType': 'file',
        //     'mightSupportStorePastisKeyRequests': true,
        //     'playbackRestrictions': 0,
        //     'secureConnectionMs': 22,
        //     'volume': 0.5,
        //     'infoMs': 122,
        //     'connectMs': 18,
        //     'authMs': 0,
        //     'bonjourMs': 0,
        //     'referenceRestrictions': 3,
        //     'SenderMACAddress': getMacAddress().toUpperCase(),
        //     'model': 'iPhone16,2',
        //     'postAuthMs': 0,
        //     'clientBundleID': 'com.basmilius.airplay',
        //     'clientProcName': 'com.basmilius.airplay',
        //     'osBuildVersion': '23C5027f',
        //     'rate': 1.0
        // })), {
        //     'Content-Type': 'application/x-apple-binary-plist',
        //     'X-Apple-Session-ID': protocol.sessionUUID,
        //     'X-Apple-Stream-ID': '1'
        // });
        //
        // console.log(response);
    });
}

async function tv(): Promise<void> {
    const discovery = Discovery.airplay();
    const device = await discovery.findUntil('Woonkamer TV._airplay._tcp.local');
    const protocol = new AirPlay(device);

    await protocol.connect();

    const keys = await protocol.verify.start({
        accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
        accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
        pairingId: Buffer.from('38393044453445352d463738442d344131332d393231392d434231433237304438323341', 'hex'),
        publicKey: Buffer.from('a3dfd6e3956006afd91204d68ddf9c26c7d9d77eee5506c69e7fe3af1288d0f4', 'hex'),
        secretKey: Buffer.from('6961e16b52f5f0be1b7723c9436356d498b4f9629f0227706a1465c5d18dbf0ba3dfd6e3956006afd91204d68ddf9c26c7d9d77eee5506c69e7fe3af1288d0f4', 'hex')
    });

    await protocol.rtsp.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupTimingServer(new TimingServer());
    await protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
    await protocol.setupDataStream(keys.sharedSecret);

    setInterval(() => protocol.feedback(), 2000);

    await protocol.dataStream.exchange(protocol.dataStream.messages.deviceInfo(keys.pairingId));

    protocol.dataStream.addListener('deviceInfo', async () => {
        await protocol.dataStream.exchange(protocol.dataStream.messages.setConnectionState());
        await protocol.dataStream.exchange(protocol.dataStream.messages.clientUpdatesConfig());
        // await protocol.dataStream.exchange(protocol.dataStream.messages.sendCommand(Proto.Command.Rewind15Seconds));

        // await waitFor(1000);

        // const options = create(Proto.CommandOptionsSchema, {
        //     stationURL: 'https://bmcdn.nl/doorbell.ogg'
        // });

        // await protocol.dataStream.exchange(protocol.dataStream.messages.sendCommand(Proto.Command.Play, options));

        // await protocol.dataStream.exchange(protocol.dataStream.messages.sendButtonEvent(12, 0x40, true));
        // await protocol.dataStream.exchange(protocol.dataStream.messages.sendButtonEvent(12, 0x40, false));

        // await waitFor(1000);

        // const response = await protocol.rtsp.post('/play', Buffer.from(serializeBinaryPlist({
        //     'Content-Location': 'https://bmcdn.nl/doorbell.ogg',
        //     'Start-Position-Seconds': 0,
        //     'uuid': uuid().toUpperCase(),
        //     'streamType': 1,
        //     'mediaType': 'file',
        //     'mightSupportStorePastisKeyRequests': true,
        //     'playbackRestrictions': 0,
        //     'secureConnectionMs': 22,
        //     'volume': 0.5,
        //     'infoMs': 122,
        //     'connectMs': 18,
        //     'authMs': 0,
        //     'bonjourMs': 0,
        //     'referenceRestrictions': 3,
        //     'SenderMACAddress': getMacAddress().toUpperCase(),
        //     'model': 'iPhone16,2',
        //     'postAuthMs': 0,
        //     'clientBundleID': 'com.basmilius.airplay',
        //     'clientProcName': 'com.basmilius.airplay',
        //     'osBuildVersion': '23C5027f',
        //     'rate': 1.0
        // })), {
        //     'Content-Type': 'application/x-apple-binary-plist',
        //     'X-Apple-Session-ID': protocol.sessionUUID,
        //     'X-Apple-Stream-ID': '1'
        // });
        //
        // console.log(response);
    });
}

async function tvPair(): Promise<void> {
    const discovery = Discovery.airplay();
    const device = await discovery.findUntil('Woonkamer TV._airplay._tcp.local');
    const protocol = new AirPlay(device);

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
