import { Discovery, TimingServer, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import { Proto } from '@basmilius/apple-airplay';
import { HomePod } from '@basmilius/apple-sdk';
import { prompt } from 'enquirer';
import ora from 'ora';
import { createInteractiveLogger, formatTime, PlaybackStateLabel, printAirPlayState } from './shared';

const log = createInteractiveLogger();

const HELP = `
Available commands:
  play, pause, playpause, stop     Playback controls
  next, prev                       Track navigation
  volup, voldown, mute             Volume (HID)
  vol <0-100>                      Volume (absolute %)
  stream <url>                     Stream audio from URL
  playurl <url>                    Play URL on device
  info                             Show now playing info
  state                            Show all clients and players
  help                             Show this help
  quit                             Disconnect and exit
`.trim();

export default async function (storage: Storage): Promise<void> {
    const spinner = ora('Searching for HomePods...').start();

    const devices = await Discovery.airplay().find();
    const homepods = devices.filter(d => d.txt.model?.startsWith('AudioAccessory'));

    if (homepods.length === 0) {
        spinner.fail('No HomePods found');
        return;
    }

    spinner.succeed(`Found ${homepods.length} HomePods`);

    const response: Record<string, string> = await prompt({
        name: 'device',
        type: 'select',
        message: 'Which HomePod?',
        choices: homepods.sort((a, b) => a.fqdn.localeCompare(b.fqdn)).map(d => ({ message: d.fqdn, name: d.id }))
    });

    const discoveryResult = homepods.find(d => d.id === response.device)!;
    const device = new HomePod({ airplay: discoveryResult });

    const timingServer = new TimingServer();
    await timingServer.listen();
    device.timingServer = timingServer;

    // Events
    device.on('connected', () => log('event', 'Connected to HomePod.'));
    device.on('disconnected', (unexpected) => log('event', unexpected ? 'Unexpectedly disconnected!' : 'Disconnected.'));

    let lastTitle = '';

    device.airplay.state.on('setState', (message) => {
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

    device.airplay.state.on('volumeDidChange', (volume) => {
        log('event', `Volume: ${Math.round(volume * 100)}%`);
    });

    // Connect
    console.log();
    log('info', 'Connecting...');
    await device.connect();
    log('info', 'Connected! Type "help" for commands.');
    console.log();

    // Interactive command loop
    const rl = await import('node:readline');
    const readline = rl.createInterface({ input: process.stdin, output: process.stdout });

    await new Promise<void>((resolveLoop) => {
        const promptCommand = () => {
            readline.question('> ', async (input) => {
                const [cmd, ...args] = input.trim().toLowerCase().split(/\s+/);

                try {
                    switch (cmd) {
                    case 'play': await device.playback.play(); log('command', 'Play'); break;
                    case 'pause': await device.playback.pause(); log('command', 'Pause'); break;
                    case 'playpause': await device.playback.playPause(); log('command', 'PlayPause'); break;
                    case 'stop': await device.playback.stop(); log('command', 'Stop'); break;
                    case 'next': await device.playback.next(); log('command', 'Next'); break;
                    case 'prev': await device.playback.previous(); log('command', 'Previous'); break;
                    case 'volup': await device.volume.up(); log('command', 'Volume Up'); break;
                    case 'voldown': await device.volume.down(); log('command', 'Volume Down'); break;
                    case 'mute': await device.volume.mute(); log('command', 'Mute'); break;
                    case 'vol':
                        if (args[0]) {
                            const pct = parseInt(args[0]) / 100;
                            await device.volume.set(pct);
                            log('command', `Volume set to ${args[0]}%`);
                        } else {
                            const vol = await device.volume.get();
                            log('info', `Volume: ${Math.round(vol * 100)}%`);
                        }
                        break;
                    case 'stream':
                        if (args[0]) {
                            log('info', `Loading ${args[0]}...`);
                            const source = await Url.fromUrl(args[0]);
                            log('info', `Streaming ${formatTime(source.duration)}...`);
                            await device.media.streamAudio(source);
                            log('command', 'Stream complete');
                        } else {
                            log('error', 'Usage: stream <url>');
                        }
                        break;
                    case 'playurl':
                        if (args[0]) {
                            log('info', `Playing URL ${args[0]}...`);
                            await device.media.playUrl(args[0]);
                            log('command', 'Playback started');
                            device.media.waitForPlaybackEnd().then(() => {
                                log('event', 'URL playback ended');
                            }).catch((err) => {
                                log('error', `URL playback error: ${err}`);
                            });
                        } else {
                            log('error', 'Usage: playurl <url>');
                        }
                        break;
                    case 'info':
                        log('info', `Title: ${device.state.title || '(none)'}`);
                        log('info', `Artist: ${device.state.artist || '(none)'}`);
                        log('info', `Album: ${device.state.album || '(none)'}`);
                        log('info', `Genre: ${device.state.genre || '(none)'}`);
                        log('info', `Duration: ${formatTime(device.state.duration)}`);
                        log('info', `Elapsed: ${formatTime(device.state.elapsedTime)}`);
                        log('info', `State: ${PlaybackStateLabel[device.state.playbackState] ?? 'Unknown'}`);
                        log('info', `Shuffle: ${device.state.shuffleMode != null ? Proto.ShuffleMode_Enum[device.state.shuffleMode] : 'Unknown'}`);
                        log('info', `Repeat: ${device.state.repeatMode != null ? Proto.RepeatMode_Enum[device.state.repeatMode] : 'Unknown'}`);
                        log('info', `Volume: ${Math.round(device.state.volume * 100)}%`);
                        log('info', `App: ${device.state.activeApp?.displayName ?? '(none)'} (${device.state.activeApp?.bundleIdentifier ?? ''})`);
                        break;
                    case 'state':
                        printAirPlayState(device.airplay.state, log);
                        break;
                    case 'help': console.log(HELP); break;
                    case 'quit':
                    case 'exit':
                        try { await device.disconnect(); } catch {}
                        readline.close();
                        timingServer.close();
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
