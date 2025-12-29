import { Proto } from '@basmilius/apple-airplay';
import { Discovery, type DiscoveryResult, reporter, TimingServer } from '@basmilius/apple-common';
import { redis } from 'bun';
import { HomePodMini } from './model';

// reporter.enable('error');
reporter.all();

async function main(): Promise<void> {
    let discoveryResult: DiscoveryResult;

    if (await redis.exists('homepod')) {
        discoveryResult = JSON.parse(await redis.get('homepod'));
    } else {
        const discovery = Discovery.airplay();
        discoveryResult = await discovery.findUntil('Slaapkamer HomePod._airplay._tcp.local');

        await redis.setex('homepod', 3600, JSON.stringify(discoveryResult));
    }

    const timingServer = new TimingServer();
    await timingServer.listen();

    function updateNowPlaying(): void {
        const client = device.airplay.state.nowPlayingClient;
        const item = client?.playbackQueue?.contentItems?.[0];

        console.log(item?.metadata);
    }

    const device = new HomePodMini(discoveryResult);
    device.airplay.timingServer = timingServer;
    await device.connect();

    device.on('disconnected', unexpected => {
        if (!unexpected) {
            return;
        }

        main();
    });

    device.airplay.state.on('setState', () => {
        const client = device.airplay.state.nowPlayingClient;

        if (!client) {
            console.log('No app playing.');
            return;
        }

        const item = client.playbackQueue?.contentItems?.[0] ?? null;

        if (!item) {
            console.log(`No item in queue of ${client.bundleIdentifier} (${client.displayName}).`);
            return;
        }

        switch (client.playbackState) {
            case Proto.PlaybackState_Enum.Unknown:
                console.log('Unknown client state.');
                break;

            case Proto.PlaybackState_Enum.Playing:
                console.log(`Now playing: ${item.metadata.title} (${item.metadata.trackArtistName})`);
                break;

            case Proto.PlaybackState_Enum.Paused:
                console.log(`Now paused: ${item.metadata.title} (${item.metadata.trackArtistName})`);
                break;

            case Proto.PlaybackState_Enum.Stopped:
                console.log(`Now stopped: ${item.metadata.title} (${item.metadata.trackArtistName})`);
                break;

            case Proto.PlaybackState_Enum.Interrupted:
                console.log(`Now interrupted: ${item.metadata.title} (${item.metadata.trackArtistName})`);
                break;

            case Proto.PlaybackState_Enum.Seeking:
                console.log(`Seeking: ${item.metadata.title} (${item.metadata.trackArtistName})`);
                break;
        }
    });

    device.airplay.state.on('updateContentItem', updateNowPlaying);
    device.airplay.state.on('setState', updateNowPlaying);

    await device.airplay.requestPlaybackQueue(1);
    console.log('Hi!');
}

await main();
