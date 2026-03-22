import { Discovery, TimingServer, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import { Proto } from '@basmilius/apple-airplay';
import { HomePod } from '@basmilius/apple-devices';
import { prompt } from 'enquirer';
import ora from 'ora';
import { createInteractiveLogger, formatTime, PlaybackStateLabel } from './shared';

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
        choices: homepods.map(d => ({ message: d.fqdn, name: d.id }))
    });

    const discoveryResult = homepods.find(d => d.id === response.device)!;
    const device = new HomePod(discoveryResult);

    const timingServer = new TimingServer();
    await timingServer.listen();
    device.airplay.timingServer = timingServer;

    // Events
    device.on('connected', () => log('event', 'Connected to HomePod.'));
    device.on('disconnected', (unexpected) => log('event', unexpected ? 'Unexpectedly disconnected!' : 'Disconnected.'));

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
                    case 'play': await device.play(); log('command', 'Play'); break;
                    case 'pause': await device.pause(); log('command', 'Pause'); break;
                    case 'playpause': await device.playPause(); log('command', 'PlayPause'); break;
                    case 'stop': await device.stop(); log('command', 'Stop'); break;
                    case 'next': await device.next(); log('command', 'Next'); break;
                    case 'prev': await device.previous(); log('command', 'Previous'); break;
                    case 'volup': await device.remote.volumeUp(); log('command', 'Volume Up'); break;
                    case 'voldown': await device.remote.volumeDown(); log('command', 'Volume Down'); break;
                    case 'mute': await device.remote.mute(); log('command', 'Mute'); break;
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
                    case 'stream':
                        if (args[0]) {
                            log('info', `Loading ${args[0]}...`);
                            const source = await Url.fromUrl(args[0]);
                            log('info', `Streaming ${formatTime(source.duration)}...`);
                            await device.streamAudio(source);
                            log('command', 'Stream complete');
                        } else {
                            log('error', 'Usage: stream <url>');
                        }
                        break;
                    case 'playurl':
                        if (args[0]) {
                            log('info', `Playing URL ${args[0]}...`);
                            await device.playUrl(args[0]);
                            log('command', 'Playback started');
                            device.waitForPlaybackEnd().then(() => {
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
                        if (npc?.genre) {
                            log('info', `Genre: ${npc.genre}`);
                        }
                        log('info', `Duration: ${formatTime(device.duration)}`);
                        log('info', `Elapsed: ${formatTime(device.elapsedTime)}`);
                        log('info', `State: ${PlaybackStateLabel[device.playbackState] ?? 'Unknown'}`);
                        log('info', `Shuffle: ${npc?.shuffleMode != null ? Proto.ShuffleMode_Enum[npc.shuffleMode] : 'Unknown'}`);
                        log('info', `Repeat: ${npc?.repeatMode != null ? Proto.RepeatMode_Enum[npc.repeatMode] : 'Unknown'}`);
                        log('info', `Volume: ${Math.round(device.volume * 100)}%`);
                        log('info', `App: ${device.displayName ?? '(none)'} (${device.bundleIdentifier ?? ''})`);
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
