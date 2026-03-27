import { Discovery, type Storage } from '@basmilius/apple-common';
import { type Protocol } from '@basmilius/apple-companion-link';
import { CompanionLinkManager, COMPANION_LINK_PROTOCOL } from '@basmilius/apple-sdk';
import { prompt } from 'enquirer';
import ora from 'ora';
import getSavedCredentials from './getSavedCredentials';
import { createInteractiveLogger } from './shared';
import { startSavingLogs } from './logger';

const log = createInteractiveLogger();

function printObject(obj: unknown, indent: number = 2): void {
    if (obj === null || obj === undefined) {
        console.log(`${' '.repeat(indent)}(null)`);
        return;
    }

    if (typeof obj !== 'object') {
        console.log(`${' '.repeat(indent)}${obj}`);
        return;
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value === null || value === undefined || value === '' || value === 0 || value === false) {
            continue;
        }

        if (value instanceof Uint8Array || (value && typeof value === 'object' && (value as any).type === 'Buffer')) {
            const len = value instanceof Uint8Array ? value.byteLength : ((value as any).data?.length ?? 0);
            if (len > 0) {
                console.log(`${' '.repeat(indent)}${key}: <${len} bytes>`);
            }
            continue;
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
            console.log(`${' '.repeat(indent)}${key}:`);
            printObject(value, indent + 2);
            continue;
        }

        if (Array.isArray(value)) {
            if (value.length > 0) {
                console.log(`${' '.repeat(indent)}${key}: [${value.length} items]`);
            }
            continue;
        }

        console.log(`${' '.repeat(indent)}${key}: ${value}`);
    }
}

const HELP = `
Available commands:
  Navigation:
    up, down, left, right, select     D-pad navigation
    menu, home, topmenu               Menu navigation
    back                              Back (HID 21)

  Playback:
    playpause                         Toggle play/pause
    play, pause                       Play / Pause (media control)
    next, prev                        Next / Previous track
    skip+ <sec>                       Skip forward (default 15s)
    skip- <sec>                       Skip backward (default 15s)

  Volume:
    volup, voldown                    Volume up/down (HID)

  Power:
    wake, sleep, power                Power controls

  Touch:
    swipe <up|down|left|right>        Swipe gesture
    tap                               Tap center

  Text:
    type <text>                       Set text
    append <text>                     Append text
    clear                             Clear text

  Apps:
    apps                              List launchable apps
    launch <bundleId>                 Launch app
    users                             List user accounts

  System:
    captions                          Toggle captions
    darkmode / lightmode              Toggle appearance
    siri                              Start Siri (enter to stop)
    findremote                        Toggle Find My Remote

  Info:
    state                             Show current state
    npi                               Fetch now playing info
    actions                           Fetch supported actions
    attention                         Fetch attention state
    hidtest <id>                      Test raw HID command by ID

  help                                Show this help
  quit                                Disconnect and exit
`.trim();

export default async function (storage: Storage): Promise<void> {
    const spinner = ora('Searching for Companion Link devices...').start();
    const devices = await Discovery.companionLink().find(false);

    if (devices.length === 0) {
        spinner.fail('No Companion Link devices found');
        return;
    }

    spinner.succeed(`Found ${devices.length} devices`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message: 'Which device?',
        choices: devices.sort((a, b) => a.fqdn.localeCompare(b.fqdn)).map(d => ({ message: d.fqdn, name: d.id }))
    });

    const discoveryResult = devices.find(d => d.id === response.device)!;

    let credentials;
    try {
        credentials = getSavedCredentials(storage, discoveryResult, 'companionLink');
    } catch {
        console.error('No credentials found. Pair first via "Pair (Companion Link)".');
        return;
    }

    startSavingLogs();

    const device = new CompanionLinkManager(discoveryResult);
    await device.setCredentials(credentials);

    let disconnected = false;

    device.on('connected', () => log('event', 'Connected'));
    device.on('disconnected', (unexpected) => {
        disconnected = true;

        if (unexpected) {
            log('error', 'Connection lost. Press Enter to return to the main menu.');
        } else {
            log('event', 'Disconnected.');
        }
    });

    device.on('attentionStateChanged', (state) => log('event', `Power: ${state}`));
    device.on('textInputChanged', (state) => {
        if (state.isActive) {
            log('event', `Keyboard active${state.isSecure ? ' [secure]' : ''} text="${state.documentText}"`);
        } else {
            log('event', 'Keyboard dismissed');
        }
    });
    device.on('mediaControlFlagsChanged', (flags, caps) => {
        const active = Object.entries(caps).filter(([, v]) => v).map(([k]) => k);
        log('event', `Media control: 0x${flags.toString(16)} [${active.join(', ')}]`);
    });
    device.on('nowPlayingInfoChanged', (info) => {
        if (info) {
            const title = (info as any)?.metadata?.title ?? (info as any)?.title ?? '';
            const state = (info as any)?.playbackState ?? '';
            log('event', `NowPlaying: ${title || '(no title)'} [state=${state}]`);
        } else {
            log('event', 'NowPlaying: (cleared)');
        }
    });
    device.on('supportedActionsChanged', (actions) => {
        const keys = Object.keys(actions);
        log('event', `SupportedActions: ${keys.join(', ') || '(none)'}`);
    });
    device.on('volumeAvailabilityChanged', (a) => log('event', `Volume available: ${a}`));

    log('info', 'Connecting...');
    await device.connect();

    const protocol = (device as any)[COMPANION_LINK_PROTOCOL] as Protocol | undefined;
    if (protocol) {
        log('info', `Source version: ${protocol.sourceVersion} (media=${protocol.supportsMediaControl}, text=${protocol.supportsTextInput}, siri=${protocol.supportsSiriPTT})`);
    }

    log('info', 'Connected! Type "help" for commands.');
    console.log();

    const rl = await import('node:readline');
    const readline = rl.createInterface({ input: process.stdin, output: process.stdout });

    await new Promise<void>((resolveLoop) => {
        const promptCommand = () => {
            readline.question('> ', async (input) => {
                if (disconnected) {
                    readline.close();
                    resolveLoop();
                    return;
                }

                const parts = input.trim().split(/\s+/);
                const cmd = parts[0].toLowerCase();
                const args = parts.slice(1);

                try {
                    switch (cmd) {
                        case 'up': await device.pressButton('Up'); log('command', 'Up'); break;
                        case 'down': await device.pressButton('Down'); log('command', 'Down'); break;
                        case 'left': await device.pressButton('Left'); log('command', 'Left'); break;
                        case 'right': await device.pressButton('Right'); log('command', 'Right'); break;
                        case 'select': await device.pressButton('Select'); log('command', 'Select'); break;
                        case 'menu': await device.pressButton('Menu'); log('command', 'Menu'); break;
                        case 'home': await device.pressButton('Home'); log('command', 'Home'); break;
                        case 'topmenu': await device.pressButton('Menu', 'Hold'); log('command', 'Top Menu (hold)'); break;
                        case 'back':
                            const backProto = (device as any)[COMPANION_LINK_PROTOCOL];
                            if (backProto) {
                                await backProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 1, _hidC: 21 } });
                                await backProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 2, _hidC: 21 } });
                            }
                            log('command', 'Back (HID 21, experimental)');
                            break;
                        case 'playpause': await device.pressButton('PlayPause'); log('command', 'PlayPause'); break;
                        case 'play': await device.mediaControlCommand('Play'); log('command', 'Play'); break;
                        case 'pause': await device.mediaControlCommand('Pause'); log('command', 'Pause'); break;
                        case 'next': await device.mediaControlCommand('NextTrack'); log('command', 'Next'); break;
                        case 'prev': await device.mediaControlCommand('PreviousTrack'); log('command', 'Previous'); break;
                        case 'volup': await device.pressButton('VolumeUp'); log('command', 'Volume Up'); break;
                        case 'voldown': await device.pressButton('VolumeDown'); log('command', 'Volume Down'); break;
                        case 'wake': await device.pressButton('Wake'); log('command', 'Wake'); break;
                        case 'sleep': await device.pressButton('Sleep'); log('command', 'Sleep'); break;
                        case 'power':
                            const powerProto = (device as any)[COMPANION_LINK_PROTOCOL];
                            if (powerProto) {
                                await powerProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 1, _hidC: 20 } });
                                await powerProto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 2, _hidC: 20 } });
                            }
                            log('command', 'Power (HID 20, experimental)');
                            break;
                        case 'skip+':
                            const fwd = parseInt(args[0] || '15');
                            await device.mediaControlCommand('SkipBy', { _skpS: fwd });
                            log('command', `Skip +${fwd}s`);
                            break;
                        case 'skip-':
                            const bwd = parseInt(args[0] || '15');
                            await device.mediaControlCommand('SkipBy', { _skpS: -bwd });
                            log('command', `Skip -${bwd}s`);
                            break;
                        case 'swipe':
                            const dir = args[0] as 'up' | 'down' | 'left' | 'right';
                            if (['up', 'down', 'left', 'right'].includes(dir)) {
                                await device.swipe(dir);
                                log('command', `Swipe ${dir}`);
                            } else {
                                log('error', 'Usage: swipe <up|down|left|right>');
                            }
                            break;
                        case 'tap':
                            await device.tap();
                            log('command', 'Tap');
                            break;
                        case 'type':
                            if (args.length > 0) {
                                await device.textSet(args.join(' '));
                                log('command', `Text: "${args.join(' ')}"`);
                            } else {
                                log('error', 'Usage: type <text>');
                            }
                            break;
                        case 'append':
                            if (args.length > 0) {
                                await device.textAppend(args.join(' '));
                                log('command', `Appended: "${args.join(' ')}"`);
                            } else {
                                log('error', 'Usage: append <text>');
                            }
                            break;
                        case 'clear':
                            await device.textClear();
                            log('command', 'Text cleared');
                            break;
                        case 'apps':
                            const apps = await device.getLaunchableApps();
                            log('info', `Apps (${apps.length}):`);
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
                            log('info', `Users (${users.length}):`);
                            for (const u of users) {
                                console.log(`  ${u.name} (${u.accountId})`);
                            }
                            break;
                        case 'captions':
                            await device.toggleCaptions();
                            log('command', 'Captions toggled');
                            break;
                        case 'darkmode':
                            await device.toggleSystemAppearance(false);
                            log('command', 'Dark mode');
                            break;
                        case 'lightmode':
                            await device.toggleSystemAppearance(true);
                            log('command', 'Light mode');
                            break;
                        case 'siri':
                            await device.siriStart();
                            log('command', 'Siri started (press enter to stop)');
                            await new Promise<void>(r => readline.question('', () => r()));
                            await device.siriStop();
                            log('command', 'Siri stopped');
                            break;
                        case 'findremote':
                            await device.toggleFindingMode(true);
                            log('command', 'Find My Remote toggled');
                            break;
                        case 'state':
                            const s = device.state;
                            log('info', `Attention: ${s.attentionState}`);
                            log('info', `Media flags: 0x${s.mediaControlFlags.toString(16)}`);
                            const caps = s.mediaCapabilities;
                            log('info', `Capabilities: ${Object.entries(caps).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`);
                            log('info', `Volume available: ${s.volumeAvailable}`);
                            log('info', `Text input: ${s.textInputState.isActive ? 'active' : 'inactive'}`);

                            if (s.nowPlayingInfo) {
                                log('info', 'NowPlaying:');
                                printObject(s.nowPlayingInfo);
                            } else {
                                log('info', 'NowPlaying: (none)');
                            }

                            if (s.supportedActions) {
                                log('info', 'SupportedActions:');
                                printObject(s.supportedActions);
                            } else {
                                log('info', 'SupportedActions: (none)');
                            }
                            break;
                        case 'npi':
                            if (device.state.nowPlayingInfo) {
                                log('info', 'NowPlaying (from state):');
                                printObject(device.state.nowPlayingInfo);
                            } else {
                                log('info', 'No NowPlaying info in state, fetching...');
                                const npi = await device.fetchNowPlayingInfo();
                                log('info', 'NowPlayingInfo (fetched):');
                                printObject(npi);
                            }
                            break;
                        case 'actions':
                            if (device.state.supportedActions) {
                                log('info', 'SupportedActions (from state):');
                                printObject(device.state.supportedActions);
                            } else {
                                log('info', 'No SupportedActions in state, fetching...');
                                const acts = await device.fetchSupportedActions();
                                log('info', 'SupportedActions (fetched):');
                                printObject(acts);
                            }
                            break;
                        case 'attention':
                            const att = await device.getAttentionState();
                            log('info', `Attention: ${att}`);
                            break;
                        case 'hidtest':
                            if (args[0]) {
                                const id = parseInt(args[0]);
                                const proto = (device as any)[COMPANION_LINK_PROTOCOL];
                                if (proto) {
                                    await proto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 1, _hidC: id } });
                                    await proto.stream.exchange(8, { _i: '_hidC', _t: 2, _c: { _hBtS: 2, _hidC: id } });
                                }
                                log('command', `HID ${id} (press+release)`);
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
                        default: log('error', `Unknown: ${cmd}. Type "help".`);
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
