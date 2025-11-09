import { Proto } from '@basmilius/apple-airplay';
import { Discovery, enableDebug } from '@basmilius/apple-common';
import { HomePodMini } from './model';

enableDebug();

const discovery = Discovery.airplay();
const discoveryResult = await discovery.findUntil('Slaapkamer HomePod._airplay._tcp.local');

const device = new HomePodMini(discoveryResult);
await device.connect();

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
