import type { CallRequest } from '@shared/contract';

type Check = (value: unknown) => boolean;
type Action = {args: readonly Check[]; optional?: number; volume?: number; confirm?: boolean};
const number = (min: number, max = Number.MAX_SAFE_INTEGER): Check => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (min: number, max: number): Check => value => Number.isInteger(value) && number(min, max)(value);
const string: Check = value => typeof value === 'string' && value.length <= 8192;
const oneOf = (...values: readonly string[]): Check => value => values.includes(value as string);
const fraction = number(0, 1);
const actions = new Map<string, Action>();
const register = (root: CallRequest['root'], path: string, action: Action): void => {actions.set(`${root}:${path}`, action);};

const REMOTE_KEYS = ['up', 'down', 'left', 'right', 'select', 'menu', 'home', 'topMenu', 'play', 'pause', 'playPause', 'stop', 'next', 'previous', 'channelUp', 'channelDown', 'volumeDown', 'mute', 'wake', 'suspend', 'siri', 'screensaver', 'guide', 'pageUp', 'pageDown', 'info', 'captions', 'back', 'exit', 'skipForward', 'skipBackward'];
const pressOptions: Check = value => {
    if (value === null || typeof value !== 'object') {
        return false;
    }

    const {mode, holdMs} = value as {mode?: unknown; holdMs?: unknown};

    return (mode === undefined || oneOf('tap', 'double', 'hold')(mode)) && (holdMs === undefined || number(0, 10000)(holdMs));
};

// `volumeUp` raises the volume, so it needs a confirm like `volume.up`; checkAction asks for it.
register('device', 'remote.press', {args: [oneOf(...REMOTE_KEYS, 'volumeUp'), pressOptions], optional: 1});
register('device', 'volume.set', {args: [fraction], volume: 0});
register('device', 'volume.fade', {args: [fraction, number(0, 60000)], volume: 0});
for (const name of ['down', 'mute']) register('device', `volume.${name}`, {args: []});
for (const name of ['up', 'unmute', 'toggleMute']) register('device', `volume.${name}`, {args: [], confirm: true});
for (const name of ['play', 'pause', 'togglePlayPause', 'stop', 'next', 'previous']) register('device', `playback.${name}`, {args: []});
for (const name of ['skipForward', 'skipBackward']) register('device', `playback.${name}`, {args: [number(0, 3600)], optional: 1});
register('device', 'playback.seek', {args: [number(0)]});
register('device', 'playback.setRate', {args: [number(0, 4)]});
register('device', 'playback.setShuffle', {args: [oneOf('off', 'albums', 'songs')]});
register('device', 'playback.setRepeat', {args: [oneOf('off', 'one', 'all')]});
register('device', 'nowPlaying.lyrics', {args: []});
for (const name of ['wake', 'sleep']) register('device', `power.${name}`, {args: []});
for (const name of ['set', 'append']) register('device', `text.${name}`, {args: [string]});
register('device', 'text.clear', {args: []});
for (const name of ['apps', 'accounts']) register('device', `${name}.list`, {args: []});
for (const name of ['launch', 'openUrl']) register('device', `apps.${name}`, {args: [string]});
register('device', 'accounts.switch', {args: [string]});
register('device', 'touch.swipe', {args: [oneOf('up', 'down', 'left', 'right'), number(50, 2000)], optional: 1});
register('device', 'touch.tap', {args: [number(0, 2000)], optional: 1});

const reads = new Map<string, readonly string[]>([
    ['device', ['id', 'name', 'address', 'model', 'modelName', 'status', 'nowPlaying.current', 'nowPlaying.elapsed', 'volume.level', 'volume.muted', 'volume.available', 'volume.mode', 'power.state', 'text.state', 'multiroom.clusterId', 'multiroom.isLeader', 'multiroom.isClusterAware']],
    ['airplayState', ['volume', 'volumeAvailable', 'volumeCapabilities', 'outputDeviceUID', 'outputDevices', 'nowPlayingClient', 'keyboardState', 'keyboardAttributes', 'clusterID', 'isClusterLeader']],
    ['companionLink', ['isOpen', 'state']]
]);

/** Agent calls use exact actions; arbitrary protocol methods never cross this boundary. */
export function checkAction(body: Record<string, unknown>): {error?: string; volume?: number; confirm?: boolean} {
    if (typeof body.root !== 'string' || typeof body.path !== 'string' || typeof body.deviceId !== 'string') return {error: 'A call needs deviceId, root and path strings.'};
    const action = actions.get(`${body.root}:${body.path}`);
    if (!action) {
        return body.args === undefined && reads.get(body.root)?.includes(body.path) ? {} : {error: `Agent action '${body.root}:${body.path}' is not registered. Use the app for raw protocol experiments.`};
    }
    const args = body.args === undefined ? [] : body.args;
    if (!Array.isArray(args) || args.length < action.args.length - (action.optional ?? 0) || args.length > action.args.length || args.some((value, index) => !action.args[index](value))) {
        return {error: `Invalid arguments for '${body.root}:${body.path}'.`};
    }
    const confirm = action.confirm || (body.root === 'device' && body.path === 'remote.press' && args[0] === 'volumeUp');
    return {volume: action.volume === undefined ? undefined : args[action.volume] as number, confirm};
}
