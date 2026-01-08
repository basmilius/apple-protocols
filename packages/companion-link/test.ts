import { Discovery, prompt, reporter } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { CompanionLink } from './src';

reporter.all();

const discovery = Discovery.companionLink();
const device = await discovery.findUntil('Woonkamer TV._companion-link._tcp.local');

const protocol = new CompanionLink(device);
protocol.socket.debug(true);
await protocol.connect();

async function pair(): Promise<void> {
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

async function verify(): Promise<void> {
    const credentials = {
        accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
        accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
        pairingId: Buffer.from('46363138303243462d334134302d343045362d394231392d423835453530323042463534', 'hex'),
        publicKey: Buffer.from('b12ef596d615e040f43675020e73a52c375d7fcecc2d10c4a342694eeb01d87a', 'hex'),
        secretKey: Buffer.from('1abbb7a03b1ff46702fc3f95b2a0b5e83bbf4a730927f88ba2975ce10fb0c7e0b12ef596d615e040f43675020e73a52c375d7fcecc2d10c4a342694eeb01d87a', 'hex')
    };

    const keys = await protocol.verify.start(credentials);

    await protocol.socket.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol._systemInfo(credentials.pairingId);
    await protocol._touchStart();
    await protocol._sessionStart();
    await protocol._tvrcSessionStart();

    await protocol._unsubscribe('_iMC');
    await protocol._subscribe('TVSystemStatus', evt => console.debug(evt));

    // await protocol._subscribe('NowPlayingInfo', handleNowPlayingInfo);
    // await protocol.fetchNowPlayingInfo();

    // await protocol._subscribe('SupportedActions', evt => console.debug(evt));
    // await protocol.fetchSupportedActions();

    // await protocol._subscribe('PushSiriRemoteInfo', evt => console.debug(evt));
    // const data = await protocol.getSiriRemoteInfo();
    // console.debug(data);

    // await protocol._subscribe('MediaControlStatus', evt => console.debug(evt));
    // const data = await protocol.fetchMediaControlStatus();
    // console.debug(data);

    // console.debug('Attention state', await protocol.getAttentionState());
    // console.debug('Launchable apps', await protocol.getLaunchableApps());
    // console.debug('Available user accounts', await protocol.getUserAccounts());

    // await protocol.launchApp('com.apple.TVMusic');
    // await protocol.launchUrl('nflx://www.netflix.com/title/70291117');
    // await protocol.switchUserAccount('71A6CA15-5268-4820-9DD8-1C53F980C149');

    // await protocol.pressButton('Select');
    // await protocol.pressButton('VolumeDown');

    // await protocol.mediaControlCommand('Pause');
    // await waitFor(2000);
    // await protocol.mediaControlCommand('Play');

    // await protocol.pressButton('PageUp');

    // await protocol.pressButton('Sleep');
    // await protocol.pressButton('Wake');

    // await protocol.mediaControlCommand('GetVolume');

    // await protocol.pressButton('Menu');
    // await protocol.pressButton('Screensaver');

    // await protocol.launchUrl('https://play.hbomax.com/video/watch/330677a5-aff2-4270-b19e-d67b021adfaf/be45824d-2c34-4d7f-9fac-2380c8e46123');
}

async function handleNowPlayingInfo({NowPlayingInfoKey}: any): Promise<void> {
    const buffer = NowPlayingInfoKey.buffer.slice(
        NowPlayingInfoKey.byteOffset,
        NowPlayingInfoKey.byteOffset + NowPlayingInfoKey.byteLength
    );

    try {
        const nowPlaying = Plist.parse(buffer) as any;
        console.log('NowPlayingInfoKey', {nowPlaying});
    } catch (err) {
        console.error(err);
        // console.error(Buffer.from(buffer).toString());
    }

    // if (!nowPlaying.$objects[15]) {
    //     try {
    //         await write('./artwork.png', nowPlaying.$objects[14]);
    //     } catch (_) {
    //     }
    // }
    //
    // if (nowPlaying.$objects[4]) {
    //     console.debug(`Now playing ${nowPlaying.$objects[8]} on Apple TV.`);
    // } else {
    //     console.debug('Not playing?');
    // }
    //
    // // console.debug(nowPlaying);
    // // console.debug('Keys', nowPlaying.$objects[1]);
    // // console.debug('Image data is placeholder', nowPlaying.$objects[15]);
    // // console.debug('metadata', nowPlaying.$objects[6]);
    // console.debug('playback state', nowPlaying.$objects[4]);
}

// await pair();
await verify();
