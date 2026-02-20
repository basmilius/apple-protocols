import { Discovery, type DiscoveryResult, reporter } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { redis } from 'bun';
import { AppleTV } from './model';

reporter.enable('error');
reporter.enable('warn');
reporter.enable('net');
reporter.all();

const credentials = {
    accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
    accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
    pairingId: Buffer.from('37313431424134412d344632452d343830352d423146302d303734464644363045344236', 'hex'),
    publicKey: Buffer.from('0b920552a12f22dc420783f07d3a218e77c56d1380b0debe29c115ff5f4d7366', 'hex'),
    secretKey: Buffer.from('c08b835bface415099acd56e227fc13c4155c8fea81450086c9745a5a296cf750b920552a12f22dc420783f07d3a218e77c56d1380b0debe29c115ff5f4d7366', 'hex')
};

async function main(): Promise<void> {
    const airplayDiscoveryResult = await airplay();
    const companionLinkDiscoveryResult = await companionLink();

    const device = new AppleTV(airplayDiscoveryResult, companionLinkDiscoveryResult);

    device.airplay.on('disconnected', unexpected => {
        if (!unexpected) {
            return;
        }

        main();
    });

    device.airplay.state.on('setNowPlayingClient', evt => {
        console.log('setNowPlayingClient', evt.client.bundleIdentifier);
    });

    device.airplay.state.on('setState', async evt => {
        console.log('setState', evt.playerPath.client.bundleIdentifier, evt.playbackState, device.airplay.state.nowPlayingClient?.playbackQueue?.contentItems?.[0]?.metadata?.title);

        const npid = evt.playbackQueue?.contentItems?.[0]?.metadata?.nowPlayingInfoData;

        if (npid) {
            const plist = Plist.parse(Buffer.from(npid).buffer);
            console.log('setState', evt.playerPath.client.bundleIdentifier, plist);
            console.log('setState', evt.playerPath.client.bundleIdentifier, evt.playbackQueue?.contentItems?.[0]);
        }
    });

    device.companionLink.on('power', state => console.log('power', state));

    await device.connect(credentials);
}

async function airplay(): Promise<DiscoveryResult> {
    if (await redis.exists('airplay')) {
        return JSON.parse(await redis.get('airplay'));
    }

    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');

    await redis.setex('airplay', 3600, JSON.stringify(discoveryResult));

    return discoveryResult;
}

async function companionLink(): Promise<DiscoveryResult> {
    // if (await redis.exists('companion-link')) {
    //     return JSON.parse(await redis.get('companion-link'));
    // }

    const discovery = Discovery.companionLink();
    const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');

    await redis.setex('companion-link', 3600, JSON.stringify(discoveryResult));

    return discoveryResult;
}

await main();
