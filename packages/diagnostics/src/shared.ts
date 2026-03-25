import { Proto } from '@basmilius/apple-airplay';
import { type AirPlayClient, type AirPlayPlayer, type AirPlayState } from '@basmilius/apple-devices';
import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';

import { PlaybackStateLabel, formatTime } from './util';
export { PlaybackStateLabel, formatTime };

type ServiceType = 'airplay' | 'companionLink';

/**
 * Discovers devices on the network and lets the user pick one.
 */
export const discoverAndSelectDevice = async (service: ServiceType, promptMessage: string): Promise<DiscoveryResult | undefined> => {
    const label = service === 'airplay' ? 'AirPlay' : 'Companion Link';
    const spinner = ora(`Searching for ${label} devices...`).start();

    const discovery = service === 'airplay'
        ? Discovery.airplay()
        : Discovery.companionLink();

    const devices = await discovery.find();

    if (devices.length === 0) {
        spinner.fail(`No ${label} devices found`);
        return undefined;
    }

    spinner.succeed(`Found ${devices.length} ${label} devices`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message: promptMessage,
        choices: devices
            .sort((a, b) => a.fqdn.localeCompare(b.fqdn))
            .map(d => ({
                message: d.fqdn,
                name: d.id
            }))
    });

    return devices.find(d => d.id === response.device)!;
};

export const isAppleTVDevice = (device: DiscoveryResult): boolean =>
    device.txt.model?.startsWith('AppleTV') ?? false;

export const isHomePodDevice = (device: DiscoveryResult): boolean =>
    device.txt.model?.startsWith('AudioAccessory') ?? false;

type ColorMap = Record<string, string>;

const defaultColors: ColorMap = {
    event: '\x1b[36m',
    command: '\x1b[32m',
    error: '\x1b[31m',
    info: '\x1b[33m'
};

const monitorColors: ColorMap = {
    state: '\x1b[36m',
    'now-playing': '\x1b[35m',
    volume: '\x1b[33m',
    device: '\x1b[32m',
    client: '\x1b[34m',
    artwork: '\x1b[38;5;208m',
    queue: '\x1b[38;5;147m',
    connection: '\x1b[31m'
};

/**
 * Creates a colored log function for diagnostics output.
 */
export const createColoredLogger = (colors: ColorMap = defaultColors) =>
    (category: string, message: string, ...args: unknown[]): void => {
        const time = new Date().toLocaleTimeString('nl-NL', {hour12: false});
        const color = colors[category] ?? '\x1b[37m';

        console.log(`\x1b[90m${time}\x1b[0m ${color}[${category}]\x1b[0m ${message}`, ...args);
    };

export const createInteractiveLogger = () => createColoredLogger(defaultColors);
export const createMonitorLogger = () => createColoredLogger(monitorColors);

/**
 * Prints the full AirPlay state tree: all clients, their players, and active now-playing info.
 *
 * @param state - The AirPlayState instance to print.
 * @param log - Logger function to use for output.
 */
export const printAirPlayState = (state: AirPlayState, log: (category: string, message: string) => void): void => {
    const clients = state.clients;
    const clientEntries = Object.values(clients);
    const nowPlayingClient = state.nowPlayingClient;

    log('info', `Clients: ${clientEntries.length}`);
    log('info', `Volume: ${Math.round(state.volume * 100)}% (available: ${state.volumeAvailable}, muted: ${state.volumeMuted})`);
    log('info', `Keyboard: ${Proto.KeyboardState_Enum[state.keyboardState] ?? 'Unknown'}`);

    if (state.clusterID) {
        log('info', `Cluster: ${state.clusterID} (leader: ${state.isClusterLeader})`);
    }

    if (state.outputDevices.length > 0) {
        log('info', `Output devices: ${state.outputDevices.map(od => od.name ?? od.uniqueIdentifier ?? 'unknown').join(', ')}`);
    }

    console.log();

    if (clientEntries.length === 0) {
        log('info', '  (no clients)');
        return;
    }

    for (const client of clientEntries) {
        const isActive = client.bundleIdentifier === nowPlayingClient?.bundleIdentifier;
        const marker = isActive ? ' *' : '';

        log('info', `${client.displayName} (${client.bundleIdentifier})${marker}`);

        printClientDetails(client);

        const players = Array.from(client.players.values());

        if (players.length === 0) {
            console.log('    (no players)');
        } else {
            for (const player of players) {
                const isActivePlayer = client.activePlayer?.identifier === player.identifier;
                const playerMarker = isActivePlayer ? ' *' : '';

                console.log(`    Player: ${player.displayName} (${player.identifier})${playerMarker}`);

                printPlayerDetails(player);
            }
        }

        console.log();
    }
};

const printClientDetails = (client: AirPlayClient): void => {
    const state = PlaybackStateLabel[client.playbackState] ?? 'Unknown';
    console.log(`    State: ${state}`);

    if (client.title) {
        console.log(`    Title: ${client.title}`);
    }

    if (client.artist) {
        console.log(`    Artist: ${client.artist}`);
    }

    if (client.album) {
        console.log(`    Album: ${client.album}`);
    }

    const commandCount = client.supportedCommands.length;

    if (commandCount > 0) {
        console.log(`    Commands: ${commandCount} supported`);
    }
};

const printPlayerDetails = (player: AirPlayPlayer): void => {
    const state = PlaybackStateLabel[player.playbackState] ?? 'Unknown';
    console.log(`      State: ${state} (rate: ${player.playbackRate})`);

    if (player.title) {
        console.log(`      Title: ${player.title}`);
    }

    if (player.artist) {
        console.log(`      Artist: ${player.artist}`);
    }

    if (player.album) {
        console.log(`      Album: ${player.album}`);
    }

    if (player.duration > 0) {
        console.log(`      Duration: ${formatTime(player.duration)}`);
        console.log(`      Elapsed: ${formatTime(player.elapsedTime)}`);
    }

    if (player.genre) {
        console.log(`      Genre: ${player.genre}`);
    }

    if (player.mediaType !== Proto.ContentItemMetadata_MediaType.UnknownMediaType) {
        console.log(`      Media: ${Proto.ContentItemMetadata_MediaType[player.mediaType] ?? player.mediaType}`);
    }

    if (player.shuffleMode !== Proto.ShuffleMode_Enum.Unknown) {
        console.log(`      Shuffle: ${Proto.ShuffleMode_Enum[player.shuffleMode]}`);
    }

    if (player.repeatMode !== Proto.RepeatMode_Enum.Unknown) {
        console.log(`      Repeat: ${Proto.RepeatMode_Enum[player.repeatMode]}`);
    }

    if (player.seriesName) {
        console.log(`      Series: ${player.seriesName} S${player.seasonNumber}E${player.episodeNumber}`);
    }

    const artworkUrl = player.artworkUrl();

    if (artworkUrl) {
        console.log(`      Artwork: ${artworkUrl}`);
    }

    if (player.currentItemArtwork) {
        console.log(`      Artwork data: ${player.currentItemArtwork.byteLength} bytes`);
    }

    if (player.supportedCommands.length > 0) {
        const commands = player.supportedCommands
            .filter(c => c.enabled)
            .map(c => Proto.Command[c.command] ?? `${c.command}`)
            .join(', ');
        console.log(`      Commands: ${commands}`);
    }
};
