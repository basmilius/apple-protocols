import { write } from 'bun';
import { debug, prompt, waitFor } from '@/cli';
import { Discovery } from '@/discovery';
import { parseBinaryPlist } from '@/encoding';
import { CompanionLink } from '@/protocol';

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
        pairingId: Buffer.from('31343733314638332d334438422d344242362d393530302d433544464243383737443735', 'hex'),
        publicKey: Buffer.from('4b7707b544e9c3b7a3609d0c9f7c9f013a71b415568bff597013d65e14d88918', 'hex'),
        secretKey: Buffer.from('3933f2526014609fc437d2b0c7968b476f3ee0fd2d836fc5e97971fbd26adae04b7707b544e9c3b7a3609d0c9f7c9f013a71b415568bff597013d65e14d88918', 'hex')
    };

    const keys = await protocol.verify.start(credentials);

    await waitFor(250);

    await protocol.socket.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.api._systemInfo(credentials.pairingId);
    await protocol.api._touchStart();
    await protocol.api._sessionStart();
    await protocol.api._tvrcSessionStart();

    await protocol.api._unsubscribe('_iMC');
    await protocol.api._subscribe('TVSystemStatus', (e: CustomEvent) => debug(e));

    // await protocol.api._subscribe('NowPlayingInfo', handleNowPlayingInfo);
    // await protocol.api.fetchNowPlayingInfo();

    // await protocol.api._subscribe('SupportedActions', (e: CustomEvent) => debug(e));
    // await protocol.api.fetchSupportedActions();

    // await protocol.api._subscribe('PushSiriRemoteInfo', (e: CustomEvent) => debug(e));
    // const data = await protocol.api.getSiriRemoteInfo();
    // debug(data);

    // await protocol.api._subscribe('MediaControlStatus', (e: CustomEvent) => debug(e));
    // const data = await protocol.api.fetchMediaControlStatus();
    // debug(data);

    // debug('Attention state', await protocol.api.getAttentionState());
    // debug('Launchable apps', await protocol.api.getLaunchableApps());
    // debug('Available user accounts', await protocol.api.getUserAccounts());

    // await protocol.api.launchApp('com.apple.TVMusic');
    // await protocol.api.launchUrl('nflx://www.netflix.com/title/70291117');
    // await protocol.api.switchUserAccount('71A6CA15-5268-4820-9DD8-1C53F980C149');

    // await protocol.api.pressButton('Select');
    // await protocol.api.pressButton('VolumeDown');

    // await protocol.api.mediaControlCommand('Pause');
    // await waitFor(2000);
    // await protocol.api.mediaControlCommand('Play');

    // await protocol.api.pressButton('PageUp');
}

async function handleNowPlayingInfo(evt: CustomEvent): Promise<void> {
    const {detail: nowPlaying} = evt;
    const parsed = parseBinaryPlist(Buffer.from(nowPlaying).buffer) as any;

    if (!parsed.$objects[15]) {
        try {
            await write('./artwork.png', parsed.$objects[14]);
        } catch (_) {
        }
    }

    if (parsed.$objects[4]) {
        debug(`Now playing ${parsed.$objects[8]} on Apple TV.`);
    } else {
        debug('Not playing?');
    }

    // debug(parsed);
    // debug('Keys', parsed.$objects[1]);
    // debug('Image data is placeholder', parsed.$objects[15]);
    // debug('metadata', parsed.$objects[6]);
    // debug('playback state', parsed.$objects[4]);
}

// await pair();
await verify();
