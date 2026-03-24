import { Discovery, reporter, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import { Proto } from '@basmilius/apple-airplay';
import { AppleTV, COMPANION_LINK } from '@basmilius/apple-devices';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { createInteractiveLogger, formatTime, PlaybackStateLabel, printAirPlayState } from './shared';

const log = createInteractiveLogger();

const HELP = `
Available commands:
  play, pause, playpause, stop     Playback controls
  next, prev                       Track navigation
  up, down, left, right, select    Navigation
  menu, home, topmenu              Menu navigation
  chup, chdown                     Channel up/down
  volup, voldown, mute             Volume (HID)
  vol <0-100>                      Volume (absolute %)
  wake, suspend                    Power
  apps                             List launchable apps
  launch <bundleId>                Launch app
  users                            List user accounts
  swipe <up|down|left|right>       Swipe gesture (AirPlay)
  tap                              Tap gesture (AirPlay)
  clswipe <up|down|left|right>     Swipe gesture (Companion Link)
  cltap                            Tap gesture (Companion Link)
  type <text>                      Type text (set)
  append <text>                    Append text
  clear                            Clear text input
  keyboard                         Show keyboard state
  stream <url>                     Stream audio from URL
  playurl <url>                    Play URL on device
  info                             Show now playing info
  state                            Show all clients and players
  fetch                            Request playback queue from device
  dump                             Dump raw metadata fields
  clnpi                            Fetch now playing via Companion Link
  captions                         Toggle captions
  darkmode                         Toggle dark mode on
  lightmode                        Toggle light mode on
  upnext                           Fetch Up Next list
  siri                             Start Siri (press enter to stop)
  findremote                       Toggle Find My Remote
  power                            Power toggle (HID 20)
  back                             Back (HID 21)
  skip+ <sec>                      Skip forward via media control
  skip- <sec>                      Skip backward via media control
  hidtest <id>                     Test raw HID command by ID
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
            .sort((a, b) => a.fqdn.localeCompare(b.fqdn))
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

    device.airplay.on('connected', () => log('event', 'AirPlay connected.'));
    device.airplay.on('disconnected', (u) => log('event', `AirPlay disconnected (unexpected=${u}).`));
    device.companionLink.on('connected', () => log('event', 'Companion Link connected.'));
    device.companionLink.on('disconnected', (u) => log('event', `Companion Link disconnected (unexpected=${u}).`));

    device.companionLink.on('connected', () => {
        const clProtocol = (device.companionLink as any)[COMPANION_LINK];
        clProtocol.stream.on('error', (err: Error) => {
            log('error', `CL stream error: ${err.message}`);
        });
        clProtocol.stream.on('close', () => {
            log('error', 'CL stream closed.');
        });
    });

    device.companionLink.on('mediaControlFlagsChanged', (flags, capabilities) => {
        const active = Object.entries(capabilities).filter(([, v]) => v).map(([k]) => k);
        log('event', `Media control: 0x${flags.toString(16)} [${active.join(', ')}]`);
    });

    device.companionLink.on('nowPlayingInfoChanged', (info) => {
        log('event', `CL NowPlaying: ${JSON.stringify(info)}`);
    });

    device.companionLink.on('supportedActionsChanged', (actions) => {
        log('event', `CL SupportedActions: ${JSON.stringify(actions)}`);
    });

    device.companionLink.on('volumeAvailabilityChanged', (available) => {
        log('event', `CL Volume available: ${available}`);
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

    device.state.on('keyboard', (message) => {
        const stateLabel = Proto.KeyboardState_Enum[message.state] ?? 'Unknown';
        const attrs = message.attributes;
        const details = attrs ? ` title="${attrs.title}" prompt="${attrs.prompt}"` : '';
        const secure = attrs?.inputTraits?.secureTextEntry ? ' [secure]' : '';
        log('event', `Keyboard (MRP): ${stateLabel}${details}${secure}`);
    });

    device.on('textInput', (state) => {
        if (state.isActive) {
            log('event', `Keyboard active${state.isSecure ? ' [secure]' : ''} text="${state.documentText}"`);
        } else {
            log('event', 'Keyboard dismissed');
        }
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
                    case 'topmenu': await device.remote.topMenu(); log('command', 'Top Menu'); break;
                    case 'chup': await device.remote.channelUp(); log('command', 'Channel Up'); break;
                    case 'chdown': await device.remote.channelDown(); log('command', 'Channel Down'); break;
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
                        log('command', 'Tap (AirPlay)');
                        break;
                    case 'clswipe':
                        const clDir = args[0];
                        if (clDir === 'up' || clDir === 'down' || clDir === 'left' || clDir === 'right') {
                            await device.companionLink.swipe(clDir);
                            log('command', `CL Swipe ${clDir}`);
                        } else {
                            log('error', 'Usage: clswipe <up|down|left|right>');
                        }
                        break;
                    case 'cltap':
                        await device.companionLink.tap();
                        log('command', 'CL Tap');
                        break;
                    case 'type':
                        if (args.length > 0) {
                            const text = args.join(' ');
                            await device.textSet(text);
                            log('command', `Text set: "${text}"`);
                        } else {
                            log('error', 'Usage: type <text>');
                        }
                        break;
                    case 'append':
                        if (args.length > 0) {
                            const appendText = args.join(' ');
                            await device.textAppend(appendText);
                            log('command', `Text appended: "${appendText}"`);
                        } else {
                            log('error', 'Usage: append <text>');
                        }
                        break;
                    case 'clear':
                        await device.textClear();
                        log('command', 'Text cleared');
                        break;
                    case 'keyboard':
                        const tiState = device.companionLink.textInputState;
                        log('info', `Active: ${tiState.isActive}`);
                        if (tiState.isActive) {
                            log('info', `Text: "${tiState.documentText}"`);
                            log('info', `Secure: ${tiState.isSecure}`);
                            log('info', `Keyboard type: ${tiState.keyboardType}`);
                            log('info', `Autocorrect: ${tiState.autocorrection}`);
                        }
                        const kbState = Proto.KeyboardState_Enum[device.state.keyboardState] ?? 'Unknown';
                        const kbAttrs = device.state.keyboardAttributes;
                        log('info', `MRP state: ${kbState}`);
                        if (kbAttrs) {
                            log('info', `MRP title: ${kbAttrs.title || '(none)'}`);
                            log('info', `MRP prompt: ${kbAttrs.prompt || '(none)'}`);
                        }
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
                    case 'playurl':
                        if (args[0]) {
                            log('info', `Playing URL ${args[0]}...`);
                            await device.airplay.playUrl(args[0]);
                            log('command', 'Playback started');
                            device.airplay.waitForPlaybackEnd().then(() => {
                                log('event', 'URL playback ended');
                            }).catch((err) => {
                                log('error', `URL playback error: ${err}`);
                            });
                        } else {
                            log('error', 'Usage: playurl <url>');
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
                    case 'state':
                        printAirPlayState(device.state, log);
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
                                const display = val instanceof Uint8Array ? `<${val.byteLength} bytes>` : typeof val === 'bigint' ? val.toString() : JSON.stringify(val, (_, v) => typeof v === 'bigint' ? v.toString() : v);
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
                            const npiResult = await device.companionLink.fetchNowPlayingInfo();
                            log('info', 'Companion Link NowPlayingInfo:');
                            console.log(JSON.stringify(npiResult, null, 2));
                        } catch (err) {
                            log('error', `Failed: ${err}`);
                        }
                        break;
                    case 'captions':
                        await device.companionLink.toggleCaptions();
                        log('command', 'Captions toggled');
                        break;
                    case 'darkmode':
                        await device.companionLink.toggleSystemAppearance(false);
                        log('command', 'Dark mode enabled');
                        break;
                    case 'lightmode':
                        await device.companionLink.toggleSystemAppearance(true);
                        log('command', 'Light mode enabled');
                        break;
                    case 'upnext':
                        try {
                            const upNext = await device.companionLink.fetchUpNext();
                            log('info', 'Up Next:');
                            console.log(JSON.stringify(upNext, null, 2));
                        } catch (err) {
                            log('error', `Failed: ${err}`);
                        }
                        break;
                    case 'siri':
                        try {
                            await device.companionLink.siriStart();
                            log('command', 'Siri started (press enter to stop)');
                            await new Promise<void>(r => readline.question('', () => r()));
                            await device.companionLink.siriStop();
                            log('command', 'Siri stopped');
                        } catch (err) {
                            log('error', `Siri failed: ${err}`);
                        }
                        break;
                    case 'findremote':
                        await device.companionLink.toggleFindingMode(true);
                        log('command', 'Find My Remote toggled');
                        break;
                    case 'power':
                        {
                            const clProto = (device.companionLink as any)[COMPANION_LINK];
                            await clProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 1, _hidC: 20 } });
                            await clProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 2, _hidC: 20 } });
                        }
                        log('command', 'Power (HID 20, experimental)');
                        break;
                    case 'back':
                        {
                            const clProto = (device.companionLink as any)[COMPANION_LINK];
                            await clProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 1, _hidC: 21 } });
                            await clProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 2, _hidC: 21 } });
                        }
                        log('command', 'Back (HID 21, experimental)');
                        break;
                    case 'skip+':
                        const skipFwd = parseInt(args[0] || '15');
                        await device.companionLink.mediaControlCommand('SkipBy', { _skpS: skipFwd });
                        log('command', `Skip forward ${skipFwd}s`);
                        break;
                    case 'skip-':
                        const skipBwd = parseInt(args[0] || '15');
                        await device.companionLink.mediaControlCommand('SkipBy', { _skpS: -skipBwd });
                        log('command', `Skip backward ${skipBwd}s`);
                        break;
                    case 'hidtest':
                        if (args[0]) {
                            const hidId = parseInt(args[0]);
                            const clProto = (device.companionLink as any)[COMPANION_LINK];
                            await clProto.stream.exchange(8, {
                                _i: '_hidC',
                                _t: 2,
                                _c: { _hBtS: 1, _hidC: hidId }
                            });
                            await clProto.stream.exchange(8, {
                                _i: '_hidC',
                                _t: 2,
                                _c: { _hBtS: 2, _hidC: hidId }
                            });
                            log('command', `HID test: ID ${hidId} (press+release)`);
                        } else {
                            log('error', 'Usage: hidtest <id>');
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
