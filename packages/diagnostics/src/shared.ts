import { Proto } from '@basmilius/apple-airplay';
import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import ora from 'ora';

export const PlaybackStateLabel: Record<number, string> = {
    [Proto.PlaybackState_Enum.Unknown]: 'Unknown',
    [Proto.PlaybackState_Enum.Playing]: 'Playing',
    [Proto.PlaybackState_Enum.Paused]: 'Paused',
    [Proto.PlaybackState_Enum.Stopped]: 'Stopped',
    [Proto.PlaybackState_Enum.Interrupted]: 'Interrupted',
    [Proto.PlaybackState_Enum.Seeking]: 'Seeking'
};

export const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

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
        choices: devices.map(d => ({
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
