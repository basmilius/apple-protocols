import { Discovery, TimingServer, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import { Proto } from '@basmilius/apple-airplay';
import { HomePod } from '@basmilius/apple-devices';
import { prompt } from 'enquirer';
import ora from 'ora';

const PlaybackStateLabel: Record<number, string> = {
    [Proto.PlaybackState_Enum.Unknown]: 'Unknown',
    [Proto.PlaybackState_Enum.Playing]: 'Playing',
    [Proto.PlaybackState_Enum.Paused]: 'Paused',
    [Proto.PlaybackState_Enum.Stopped]: 'Stopped',
    [Proto.PlaybackState_Enum.Interrupted]: 'Interrupted',
    [Proto.PlaybackState_Enum.Seeking]: 'Seeking'
};

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const log = (category: string, message: string): void => {
    const time = new Date().toLocaleTimeString('nl-NL', { hour12: false });
    const colors: Record<string, string> = {
        event: '\x1b[36m',
        command: '\x1b[32m',
        error: '\x1b[31m',
        info: '\x1b[33m'
    };
    console.log(`\x1b[90m${time}\x1b[0m ${colors[category] ?? '\x1b[37m'}[${category}]\x1b[0m ${message}`);
};

const HELP = `
Available commands:
  play, pause, playpause, stop     Playback controls
  next, prev                       Track navigation
  volup, voldown, mute             Volume (HID)
  vol <0-100>                      Volume (absolute %)
  stream <url>                     Stream audio from URL
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
                        await device.disconnect();
                        readline.close();
                        timingServer.close();
                        process.exit(0);
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
}
