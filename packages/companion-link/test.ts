import { Discovery, prompt } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { CompanionLink } from './src';

const discovery = Discovery.companionLink();
const device = await discovery.findUntil('Woonkamer TV._companion-link._tcp.local');

const protocol = new CompanionLink(device);
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

    await protocol.api._systemInfo(credentials.pairingId);
    await protocol.api._touchStart();
    await protocol.api._sessionStart();
    await protocol.api._tvrcSessionStart();

    await protocol.api._unsubscribe('_iMC');
    await protocol.api._subscribe('TVSystemStatus', evt => console.debug(evt));

    // await protocol.api._subscribe('NowPlayingInfo', handleNowPlayingInfo);
    // await protocol.api.fetchNowPlayingInfo();

    // await protocol.api._subscribe('SupportedActions', evt => console.debug(evt));
    // await protocol.api.fetchSupportedActions();

    // await protocol.api._subscribe('PushSiriRemoteInfo', evt => console.debug(evt));
    // const data = await protocol.api.getSiriRemoteInfo();
    // console.debug(data);

    // await protocol.api._subscribe('MediaControlStatus', evt => console.debug(evt));
    // const data = await protocol.api.fetchMediaControlStatus();
    // console.debug(data);

    // console.debug('Attention state', await protocol.api.getAttentionState());
    // console.debug('Launchable apps', await protocol.api.getLaunchableApps());
    // console.debug('Available user accounts', await protocol.api.getUserAccounts());

    // await protocol.api.launchApp('com.apple.TVMusic');
    // await protocol.api.launchUrl('nflx://www.netflix.com/title/70291117');
    // await protocol.api.switchUserAccount('71A6CA15-5268-4820-9DD8-1C53F980C149');

    // await protocol.api.pressButton('Select');
    // await protocol.api.pressButton('VolumeDown');

    // await protocol.api.mediaControlCommand('Pause');
    // await waitFor(2000);
    // await protocol.api.mediaControlCommand('Play');

    // await protocol.api.pressButton('PageUp');

    // await protocol.api.pressButton('Sleep');
    // await protocol.api.pressButton('Wake');

    // await protocol.api.mediaControlCommand('GetVolume');

    // await protocol.api.pressButton('Menu');
    // await protocol.api.pressButton('Screensaver');

    // await protocol.api.launchUrl('https://play.hbomax.com/video/watch/330677a5-aff2-4270-b19e-d67b021adfaf/be45824d-2c34-4d7f-9fac-2380c8e46123');
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
