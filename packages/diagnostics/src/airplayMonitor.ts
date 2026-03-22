import { Proto } from '@basmilius/apple-airplay';
import { TimingServer, type Storage } from '@basmilius/apple-common';
import { AirPlayDevice } from '@basmilius/apple-devices';
import getSavedCredentials from './getSavedCredentials';
import { createMonitorLogger, discoverAndSelectDevice, formatTime, isAppleTVDevice, PlaybackStateLabel } from './shared';

const log = createMonitorLogger();

export default async function (storage: Storage): Promise<void> {
    console.log('If your device is not shown, restart the diagnostics tool and try again.');

    const discoveryResult = await discoverAndSelectDevice('airplay', 'Which device would you like to monitor?');

    if (!discoveryResult) {
        return;
    }

    const isAppleTV = isAppleTVDevice(discoveryResult);

    const device = new AirPlayDevice(discoveryResult);

    const timingServer = new TimingServer();
    await timingServer.listen();
    device.timingServer = timingServer;

    if (isAppleTV) {
        const credentials = getSavedCredentials(storage, discoveryResult, 'airplay');
        device.setCredentials(credentials);
    }

    // Connection events
    device.on('connected', () => {
        log('connection', 'Connected to device.');
        console.log();
    });

    device.on('disconnected', (unexpected) => {
        log('connection', unexpected ? 'Unexpectedly disconnected!' : 'Disconnected.');
    });

    // Device info
    device.state.on('deviceInfo', (message) => {
        log('device', `Name: ${message.name}`);
        log('device', `Model: ${message.modelID ?? 'unknown'}`);
        log('device', `Device UID: ${message.deviceUID ?? message.uniqueIdentifier ?? 'unknown'}`);

        if (message.clusterID) {
            log('device', `Cluster: ${message.clusterID}`);
        }
    });

    device.state.on('deviceInfoUpdate', (message) => {
        log('device', 'Device info updated.');

        if (message.deviceUID) {
            log('device', `Device UID: ${message.deviceUID}`);
        }
    });

    // Client management
    device.state.on('clients', (clients) => {
        const names = Object.values(clients).map(c => `${c.displayName} (${c.bundleIdentifier})`);
        log('client', `Active clients: ${names.join(', ') || 'none'}`);
    });

    device.state.on('setNowPlayingClient', (message) => {
        const id = message.client?.bundleIdentifier ?? 'none';
        const name = message.client?.displayName ?? '';
        log('client', `Now playing client: ${name} (${id})`);
    });

    device.state.on('setNowPlayingPlayer', (message) => {
        log('client', `Now playing player changed.`);
    });

    device.state.on('removeClient', (message) => {
        log('client', `Client removed: ${message.client?.bundleIdentifier}`);
    });

    // Now playing (change-detected)
    device.state.on('nowPlayingChanged', (client, player) => {
        console.log();

        if (!client || !player) {
            log('now-playing', 'Nothing playing.');
            console.log();
            return;
        }

        log('state', `${PlaybackStateLabel[player.playbackState] ?? player.playbackState} (${client.bundleIdentifier})`);

        if (player.title) {
            log('now-playing', `${player.title}`);
        }

        if (player.artist) {
            log('now-playing', `  Artist: ${player.artist}`);
        }

        if (player.album) {
            log('now-playing', `  Album: ${player.album}`);
        }

        if (player.genre) {
            log('now-playing', `  Genre: ${player.genre}`);
        }

        if (player.seriesName) {
            log('now-playing', `  Series: ${player.seriesName} S${player.seasonNumber}E${player.episodeNumber}`);
        }

        if (player.duration > 0) {
            log('now-playing', `  Duration: ${formatTime(player.duration)}`);
        }

        if (player.mediaType !== Proto.ContentItemMetadata_MediaType.UnknownMediaType) {
            log('now-playing', `  Media type: ${Proto.ContentItemMetadata_MediaType[player.mediaType] ?? player.mediaType}`);
        }

        if (player.shuffleMode !== Proto.ShuffleMode_Enum.Unknown) {
            log('now-playing', `  Shuffle: ${Proto.ShuffleMode_Enum[player.shuffleMode] ?? player.shuffleMode}`);
        }

        if (player.repeatMode !== Proto.RepeatMode_Enum.Unknown) {
            log('now-playing', `  Repeat: ${Proto.RepeatMode_Enum[player.repeatMode] ?? player.repeatMode}`);
        }

        if (!player.isDefaultPlayer) {
            log('now-playing', `  Player: ${player.displayName} (${player.identifier})`);
        }

        console.log();
    });

    // Supported commands (from raw setState, not part of nowPlayingChanged)
    device.state.on('setState', (message) => {
        if (message.supportedCommands) {
            const commands = message.supportedCommands.supportedCommands
                .filter(c => c.enabled)
                .map(c => Proto.Command[c.command] ?? `${c.command}`)
                .join(', ');

            log('state', `Supported commands: ${commands}`);
        }
    });

    // Playback queue
    device.state.on('setState', (message) => {
        if (!message.playbackQueue) {
            return;
        }

        const queue = message.playbackQueue;
        const items = queue.contentItems;

        if (items.length === 0) {
            return;
        }

        log('queue', `Queue: ${items.length} items, position ${queue.location}`);

        for (let i = 0; i < Math.min(items.length, 5); i++) {
            const item = items[i];
            const meta = item.metadata;
            const prefix = i === queue.location ? '  > ' : '    ';
            const title = meta?.title ?? item.identifier;

            log('queue', `${prefix}${title}${meta?.trackArtistName ? ` - ${meta.trackArtistName}` : ''}`);
        }

        if (items.length > 5) {
            log('queue', `    ... and ${items.length - 5} more`);
        }
    });

    // Content item updates
    device.state.on('updateContentItem', (message) => {
        for (const item of message.contentItems) {
            const title = item.metadata?.title ?? item.identifier;
            log('queue', `Content item updated: ${title}`);

            if (item.artworkData?.byteLength > 0) {
                log('artwork', `Inline artwork: ${item.artworkData.byteLength} bytes (${item.artworkDataWidth}x${item.artworkDataHeight})`);
            }

            if (item.dataArtworks.length > 0) {
                for (const art of item.dataArtworks) {
                    log('artwork', `Data artwork (${art.type}): ${art.imageData.byteLength} bytes`);
                }
            }

            if (item.remoteArtworks.length > 0) {
                for (const art of item.remoteArtworks) {
                    log('artwork', `Remote artwork (${art.type}): ${art.artworkURLString}`);
                }
            }

            if (item.lyrics) {
                log('queue', `Lyrics available.`);
            }
        }
    });

    device.state.on('updateContentItemArtwork', (message) => {
        log('artwork', `Artwork updated for content item.`);
    });

    // Artwork via setArtwork
    device.state.on('setArtwork', (message) => {
        log('artwork', `Set artwork: ${message.jpegData?.byteLength ?? 0} bytes`);
    });

    // Volume
    device.state.on('volumeDidChange', (volume) => {
        log('volume', `Volume: ${Math.round(volume * 100)}%`);
    });

    device.state.on('volumeControlAvailability', (available, capabilities) => {
        log('volume', `Volume control: ${available ? 'available' : 'unavailable'} (${Proto.VolumeCapabilities_Enum[capabilities] ?? capabilities})`);
    });

    device.state.on('volumeControlCapabilitiesDidChange', (available, capabilities) => {
        log('volume', `Volume capabilities changed: ${available ? 'available' : 'unavailable'} (${Proto.VolumeCapabilities_Enum[capabilities] ?? capabilities})`);
    });

    // Output device
    device.state.on('updateOutputDevice', (message) => {
        log('device', `Output device updated.`);

        if (message.outputDevices.length > 0) {
            for (const od of message.outputDevices) {
                log('device', `  ${od.name ?? 'unnamed'} (${od.uniqueIdentifier ?? 'no-id'})`);
            }
        }
    });

    // Supported commands
    device.state.on('setDefaultSupportedCommands', (message) => {
        if (!message.supportedCommands) {
            return;
        }

        const commands = message.supportedCommands.supportedCommands
            .filter(c => c.enabled)
            .map(c => Proto.Command[c.command] ?? `${c.command}`)
            .join(', ');

        log('state', `Default supported commands: ${commands}`);
    });

    // Connect
    console.log();
    log('connection', `Connecting to ${discoveryResult.fqdn}...`);

    await device.connect();
}
