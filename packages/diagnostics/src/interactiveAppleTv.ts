import { Discovery, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import { Proto } from '@basmilius/apple-airplay';
import { AppleTV, COMPANION_LINK } from '@basmilius/apple-devices';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { createInteractiveLogger, formatTime, PlaybackStateLabel } from './shared';

const log = createInteractiveLogger();

const HELP = `
Available commands:
  play, pause, playpause, stop     Playback controls
  next, prev                       Track navigation
  up, down, left, right, select    Navigation
  menu, home                       Menu navigation
  volup, voldown, mute             Volume (HID)
  vol <0-100>                      Volume (absolute %)
  wake, suspend                    Power
  apps                             List launchable apps
  launch <bundleId>                Launch app
  users                            List user accounts
  swipe <up|down|left|right>       Swipe gesture
  tap                              Tap gesture
  stream <url>                     Stream audio from URL
  info                             Show now playing info
  fetch                            Request playback queue from device
  dump                             Dump raw metadata fields
  clnpi                            Fetch now playing via Companion Link
  help                             Show this help
  quit                             Disconnect and exit
`.trim();

export default async function (storage: Storage): Promise<void> {
    const spinner = ora('Searching for devices...').start();

    const airplayDevices = await Discovery.airplay().find(false);
    const companionDevices = await Discovery.companionLink().find(false);

    if (airplayDevices.length === 0) {
        spinner.fail('No AirPlay devices found');
        return;
    }

    spinner.succeed(`Found ${airplayDevices.length} AirPlay devices`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message: 'Which Apple TV?',
        choices: airplayDevices
            .filter(d => d.txt.model?.startsWith('AppleTV'))
            .map(d => ({ message: d.fqdn, name: d.id }))
    });

    const airplayResult = airplayDevices.find(d => d.id === response.device)!;
    const companionResult = companionDevices.find(d =>
        d.id === airplayResult.id ||
        d.address === airplayResult.address ||
        d.fqdn === airplayResult.fqdn
    );

    if (!companionResult) {
        console.error('Companion Link device not found for this Apple TV.');
        console.error('AirPlay ID:', airplayResult.id, 'Address:', airplayResult.address);
        console.error('Companion Link devices:', companionDevices.map(d => `${d.id} (${d.address})`).join(', '));
        return;
    }

    const airplayCredentials = getSavedCredentials(storage, airplayResult, 'airplay');

    let companionLinkCredentials;
    try {
        companionLinkCredentials = getSavedCredentials(storage, companionResult, 'companionLink');
    } catch {
        try {
            companionLinkCredentials = getSavedCredentials(storage, airplayResult, 'companionLink');
        } catch {
            console.error('No Companion Link credentials found. Pair via Companion Link first.');
            return;
        }
    }

    const device = new AppleTV(airplayResult, companionResult);

    // Events
    device.on('connected', () => log('event', 'Connected to Apple TV.'));
    device.on('disconnected', (unexpected) => log('event', unexpected ? 'Unexpectedly disconnected!' : 'Disconnected.'));
    device.on('power', (state) => log('event', `Power: ${state}`));
    (device.companionLink as any).on('mediaControl', (data: any) => {
        log('event', `_iMC: ${JSON.stringify(data)}`);
    });

    let lastTitle = '';

    device.state.on('setState', (message) => {
        const state = message.playbackState;

        if (state !== undefined) {
            log('event', `State: ${PlaybackStateLabel[state] ?? state}`);
        }

        if (message.nowPlayingInfo) {
            const title = message.nowPlayingInfo.title || '';

            if (title && title !== lastTitle) {
                lastTitle = title;
                const artist = message.nowPlayingInfo.artist || '';
                const album = message.nowPlayingInfo.album || '';
                const duration = message.nowPlayingInfo.duration || 0;
                log('event', `Now playing: ${title}${artist ? ` - ${artist}` : ''}${album ? ` (${album})` : ''}${duration > 0 ? ` [${formatTime(duration)}]` : ''}`);
            }
        }
    });

    device.state.on('volumeDidChange', (volume) => {
        log('event', `Volume: ${Math.round(volume * 100)}%`);
    });

    device.state.on('clients', (clients) => {
        const names = Object.values(clients).map(c => `${c.displayName} (${c.bundleIdentifier})`);
        log('event', `Clients: ${names.join(', ') || 'none'}`);
    });

    // Connect
    console.log();
    log('info', 'Connecting...');
    await device.connect(airplayCredentials, companionLinkCredentials);

    log('info', 'Connected! Type "help" for commands.');
    console.log();

    // Interactive command loop
    const rl = await import('node:readline');
    const readline = rl.createInterface({ input: process.stdin, output: process.stdout });

    await new Promise<void>((resolveLoop) => {
        const promptCommand = () => {
            readline.question('> ', async (input) => {
                const parts = input.trim().split(/\s+/);
                const cmd = parts[0].toLowerCase();
                const args = parts.slice(1);

                try {
                    switch (cmd) {
                    case 'play': await device.play(); log('command', 'Play'); break;
                    case 'pause': await device.pause(); log('command', 'Pause'); break;
                    case 'playpause': await device.playPause(); log('command', 'PlayPause'); break;
                    case 'stop': await device.stop(); log('command', 'Stop'); break;
                    case 'next': await device.next(); log('command', 'Next'); break;
                    case 'prev': await device.previous(); log('command', 'Previous'); break;
                    case 'up': await device.remote.up(); log('command', 'Up'); break;
                    case 'down': await device.remote.down(); log('command', 'Down'); break;
                    case 'left': await device.remote.left(); log('command', 'Left'); break;
                    case 'right': await device.remote.right(); log('command', 'Right'); break;
                    case 'select': await device.remote.select(); log('command', 'Select'); break;
                    case 'menu': await device.remote.menu(); log('command', 'Menu'); break;
                    case 'home': await device.remote.home(); log('command', 'Home'); break;
                    case 'volup': await device.volumeUp(); log('command', 'Volume Up'); break;
                    case 'voldown': await device.volumeDown(); log('command', 'Volume Down'); break;
                    case 'mute': await device.volumeMute(); log('command', 'Mute'); break;
                    case 'vol':
                        if (args[0]) {
                            const pct = parseInt(args[0]) / 100;
                            await device.volumeControl.set(pct);
                            log('command', `Volume set to ${args[0]}%`);
                        } else {
                            const vol = await device.volumeControl.get();
                            log('info', `Volume: ${Math.round(vol * 100)}%`);
                        }
                        break;
                    case 'wake': await device.turnOn(); log('command', 'Wake'); break;
                    case 'suspend': await device.turnOff(); log('command', 'Suspend'); break;
                    case 'apps':
                        const apps = await device.getLaunchableApps();
                        log('info', `Launchable apps (${apps.length}):`);
                        for (const app of apps) {
                            console.log(`  ${app.name} (${app.bundleId})`);
                        }
                        break;
                    case 'launch':
                        if (args[0]) {
                            await device.launchApp(args[0]);
                            log('command', `Launched ${args[0]}`);
                        } else {
                            log('error', 'Usage: launch <bundleId>');
                        }
                        break;
                    case 'users':
                        const users = await device.getUserAccounts();
                        log('info', `User accounts (${users.length}):`);
                        for (const user of users) {
                            console.log(`  ${user.name} (${user.accountId})`);
                        }
                        break;
                    case 'swipe':
                        const dir = args[0];
                        if (dir === 'up') { await device.remote.swipeUp(); }
                        else if (dir === 'down') { await device.remote.swipeDown(); }
                        else if (dir === 'left') { await device.remote.swipeLeft(); }
                        else if (dir === 'right') { await device.remote.swipeRight(); }
                        else { log('error', 'Usage: swipe <up|down|left|right>'); break; }
                        log('command', `Swipe ${dir}`);
                        break;
                    case 'tap':
                        await device.remote.tap(200, 200);
                        log('command', 'Tap');
                        break;
                    case 'stream':
                        if (args[0]) {
                            log('info', `Loading ${args[0]}...`);
                            const audioSource = await Url.fromUrl(args[0]);
                            log('info', `Streaming ${formatTime(audioSource.duration)}...`);
                            await device.airplay.streamAudio(audioSource);
                            log('command', 'Stream complete');
                        } else {
                            log('error', 'Usage: stream <url>');
                        }
                        break;
                    case 'info':
                        const npc = device.state.nowPlayingClient;
                        log('info', `Title: ${device.title || '(none)'}`);
                        log('info', `Artist: ${device.artist || '(none)'}`);
                        log('info', `Album: ${device.album || '(none)'}`);
                        if (npc?.seriesName) {
                            log('info', `Series: ${npc.seriesName} S${npc.seasonNumber}E${npc.episodeNumber}`);
                        }
                        if (npc?.genre) {
                            log('info', `Genre: ${npc.genre}`);
                        }
                        log('info', `Media: ${npc?.mediaType != null ? Proto.ContentItemMetadata_MediaType[npc.mediaType] ?? 'Unknown' : 'Unknown'}`);
                        log('info', `Duration: ${formatTime(device.duration)}`);
                        log('info', `Elapsed: ${formatTime(device.elapsedTime)}`);
                        log('info', `State: ${PlaybackStateLabel[device.playbackState] ?? 'Unknown'}`);
                        log('info', `Shuffle: ${npc?.shuffleMode != null ? Proto.ShuffleMode_Enum[npc.shuffleMode] : 'Unknown'}`);
                        log('info', `Repeat: ${npc?.repeatMode != null ? Proto.RepeatMode_Enum[npc.repeatMode] : 'Unknown'}`);
                        log('info', `Volume: ${Math.round(device.volume * 100)}%`);
                        log('info', `App: ${device.displayName ?? '(none)'} (${device.bundleIdentifier ?? ''})`);
                        break;
                    case 'fetch':
                        log('info', 'Requesting playback queue...');
                        await device.airplay.requestPlaybackQueue(1);
                        log('command', 'Playback queue requested. Use "dump" to see results.');
                        break;
                    case 'dump':
                        const dumpFields = (label: string, obj: any) => {
                            if (!obj) {
                                log('info', `${label}: (null)`);
                                return;
                            }
                            log('info', `${label}:`);
                            for (const [key, val] of Object.entries(obj)) {
                                if (key === '$typeName') { continue; }
                                if (val === '' || val === 0 || val === false) { continue; }
                                if (val instanceof Uint8Array && val.byteLength === 0) { continue; }
                                if (val == null) { continue; }
                                const display = val instanceof Uint8Array ? `<${val.byteLength} bytes>` : typeof val === 'bigint' ? val.toString() : JSON.stringify(val);
                                console.log(`  ${key}: ${display}`);
                            }
                        };
                        const dc = device.state.nowPlayingClient;
                        log('info', `Client: ${dc?.bundleIdentifier ?? '(none)'} / ${dc?.displayName ?? ''}`);
                        log('info', `PlaybackState: ${dc ? PlaybackStateLabel[dc.playbackState] ?? dc.playbackState : '(none)'}`);
                        log('info', `Queue items: ${dc?.playbackQueue?.contentItems?.length ?? 0}, location: ${dc?.playbackQueue?.location ?? -1}`);
                        dumpFields('NowPlayingInfo', dc?.nowPlayingInfo);
                        dumpFields('ContentItemMetadata', dc?.currentItemMetadata);
                        dumpFields('ContentItem (top-level)', dc?.currentItem ? {
                            identifier: dc.currentItem.identifier,
                            artworkDataLength: dc.currentItem.artworkData?.byteLength ?? 0,
                            artworkDataWidth: dc.currentItem.artworkDataWidth,
                            artworkDataHeight: dc.currentItem.artworkDataHeight,
                            remoteArtworks: dc.currentItem.remoteArtworks?.length ?? 0,
                            dataArtworks: dc.currentItem.dataArtworks?.length ?? 0,
                            animatedArtworks: dc.currentItem.animatedArtworks?.length ?? 0,
                            lyrics: !!dc.currentItem.lyrics,
                        } : null);
                        log('info', `Artwork available: ${dc?.currentItemMetadata?.artworkAvailable ?? false}`);
                        log('info', `Artwork URL: ${dc?.currentItemArtworkUrl ?? '(none)'}`);
                        log('info', `Artwork bytes: ${dc?.currentItemArtwork?.byteLength ?? 0}`);
                        break;
                    case 'clnpi':
                        try {
                            const npiResult = await (device.companionLink as any)[COMPANION_LINK].fetchNowPlayingInfo();
                            log('info', 'Companion Link NowPlayingInfo:');
                            console.log(JSON.stringify(npiResult, null, 2));
                        } catch (err) {
                            log('error', `Failed: ${err}`);
                        }
                        break;
                    case 'help': console.log(HELP); break;
                    case 'quit':
                    case 'exit':
                        try { await device.disconnect(); } catch {}
                        readline.close();
                        resolveLoop();
                        return;
                    case '': break;
                    default: log('error', `Unknown command: ${cmd}. Type "help" for commands.`);
                }
            } catch (err) {
                log('error', `${err}`);
            }

                promptCommand();
            });
        };

        promptCommand();
    });
}
