import type { CallRequest } from '@shared/contract';

type Check = (value: unknown) => boolean;
type Action = {args: readonly Check[]; optional?: number; volume?: number; confirm?: boolean};
const number = (min: number, max = Number.MAX_SAFE_INTEGER): Check => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (min: number, max: number): Check => value => Number.isInteger(value) && number(min, max)(value);
const string: Check = value => typeof value === 'string' && value.length <= 8192;
const fraction = number(0, 1);
const actions = new Map<string, Action>();
const register = (root: CallRequest['root'], path: string, action: Action): void => {actions.set(`${root}:${path}`, action);};

for (const root of ['device', 'airplay'] as const) {
    for (const name of ['up', 'down', 'left', 'right', 'select', 'menu', 'home', 'topMenu', 'play', 'pause', 'playPause', 'stop', 'next', 'previous', 'channelUp', 'channelDown', 'volumeDown', 'mute', 'wake', 'suspend']) {
        register(root, `remote.${name}`, {args: []});
    }
    register(root, 'remote.volumeUp', {args: [], confirm: true});
    register(root, 'volume.set', {args: [fraction], volume: 0});
    register(root, 'volume.fade', {args: [fraction, number(0, 60000)], volume: 0});
    register(root, 'volume.setForDevice', {args: [string, fraction], volume: 1});
    for (const name of ['get', 'down', 'mute']) register(root, `volume.${name}`, {args: []});
    for (const name of ['up', 'unmute', 'toggleMute']) register(root, `volume.${name}`, {args: [], confirm: true});
    register(root, 'volume.getForDevice', {args: [string]});
    register(root, 'volume.muteDevice', {args: [string]});
    register(root, 'volume.unmuteDevice', {args: [string], confirm: true});
    register(root, 'volume.adjust', {args: [integer(1, 6), string], optional: 1, confirm: true});
}
for (const name of ['play', 'pause', 'playPause', 'stop', 'next', 'previous', 'advanceShuffleMode', 'advanceRepeatMode', 'beginFastForward', 'endFastForward', 'beginRewind', 'endRewind', 'nextChapter', 'previousChapter', 'likeTrack', 'dislikeTrack', 'bookmarkTrack', 'addToLibrary']) register('device', `playback.${name}`, {args: []});
for (const name of ['skipForward', 'skipBackward']) register('device', `playback.${name}`, {args: [number(0, 3600)], optional: 1});
register('device', 'playback.seekTo', {args: [number(0)]});
register('device', 'playback.setPlaybackRate', {args: [number(0, 4)]});
for (const name of ['setShuffleMode', 'setRepeatMode']) register('device', `playback.${name}`, {args: [integer(0, 3)]});
register('device', 'playback.requestPlaybackQueue', {args: [integer(1, 100)], optional: 1});
for (const name of ['on', 'off', 'getState']) register('device', `power.${name}`, {args: []});
for (const name of ['type', 'append']) register('device', `keyboard.${name}`, {args: [string]});
for (const name of ['clear', 'getSession']) register('device', `keyboard.${name}`, {args: []});
for (const name of ['apps', 'accounts']) register('device', `${name}.list`, {args: []});
for (const name of ['launch', 'openUrl']) register('device', `apps.${name}`, {args: [string]});
for (const name of ['switch', 'switchActive']) register('device', `accounts.${name}`, {args: [string]});
for (const name of ['getLyrics', 'waitForPlaybackEnd', 'stopPlayUrl', 'stopStreamAudio']) register('device', `media.${name}`, {args: []});

const reads = new Map<string, readonly string[]>([
    ['device', ['id', 'name', 'address', 'isConnected', 'state.nowPlaying', 'state.volume', 'state.volumeMuted', 'multiroom.clusterId', 'multiroom.isLeader', 'multiroom.isClusterAware']],
    ['airplayState', ['volume', 'volumeAvailable', 'volumeCapabilities', 'outputDeviceUID', 'outputDevices', 'nowPlayingClient', 'keyboardInfo', 'clusterID', 'isClusterLeader']],
    ['companionLink', ['isConnected', 'state', 'textInputState']]
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
    return {volume: action.volume === undefined ? undefined : args[action.volume] as number, confirm: action.confirm};
}
