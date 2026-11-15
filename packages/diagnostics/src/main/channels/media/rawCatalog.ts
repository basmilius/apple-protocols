import { Messages, Proto } from '@corewire/airplay/mrp';
import { type CompanionLinkSession, FrameType } from '@corewire/companion-link';
import { Plist } from '@corewire/core/encoding';
import type { RawBuilderInfo, RawMessageRequest, RawParam, RawParamOption, RawTransport } from '@shared/contract';

export type RawEntry = RawBuilderInfo & {
    run(targets: RawTargets, args: Args, exchange: boolean): Promise<unknown> | unknown;
};

/** The objects a raw call may reach, all of them optional depending on what is connected. */
export type RawTargets = {
    readonly dataStream?: DataStreamTarget;
    readonly companionLink?: CompanionLinkTarget;
    readonly controlStream?: ControlStreamTarget;
};

type Args = Readonly<Record<string, unknown>>;

/** What `Messages.*` hands back: a ProtocolMessage, alone or paired with its extension. */
type Message = unknown;

type DataStreamTarget = {
    send(message: never): void;
    exchange(message: never, timeout?: number): Promise<unknown>;
};

type CompanionLinkTarget = CompanionLinkSession;

type ControlStreamTarget = Record<string, (...args: never[]) => unknown>;

const string = (name: string, label: string, defaultValue = '', optional = false, hint?: string): RawParam => ({name, label, type: 'string', defaultValue, optional, hint});
const number = (name: string, label: string, defaultValue = 0, hint?: string): RawParam => ({name, label, type: 'number', defaultValue, hint});
const boolean = (name: string, label: string, defaultValue = false): RawParam => ({name, label, type: 'boolean', defaultValue});
const json = (name: string, label: string, defaultValue = '{}', hint?: string): RawParam => ({name, label, type: 'json', defaultValue, hint});
const stringList = (name: string, label: string, defaultValue: readonly string[] = [], hint?: string): RawParam => ({name, label, type: 'stringList', defaultValue, hint});

const choice = (name: string, label: string, source: object, defaultValue: number): RawParam => ({name, label, type: 'enum', options: optionsOf(source), defaultValue});

/** The named values of a generated protobuf enum, which TypeScript keeps as a reverse map. */
function optionsOf(source: object): readonly RawParamOption[] {
    return Object.entries(source)
        .filter(([, value]) => typeof value === 'number')
        .map(([label, value]) => ({label, value: value as number}));
}

const asString = (args: Args, name: string): string => String(args[name] ?? '');

const asNumber = (args: Args, name: string, fallback = 0): number => {
    const value = Number(args[name]);

    return Number.isFinite(value) ? value : fallback;
};

const asBoolean = (args: Args, name: string): boolean => args[name] === true;
const asList = (args: Args, name: string): string[] => (Array.isArray(args[name]) ? (args[name] as unknown[]).map(entry => String(entry)) : []);

const asRecord = (args: Args, name: string): Record<string, unknown> => {
    const value = args[name];

    if (typeof value === 'string') {
        return value.trim().length === 0 ? {} : (JSON.parse(value) as Record<string, unknown>);
    }

    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
};

/** Every DataStream builder is sent the same way; only the message differs. */
function dataStream(id: string, title: string, category: string, description: string, params: readonly RawParam[], build: (args: Args) => Message): RawEntry {
    return {
        id,
        title,
        transport: 'dataStream',
        category,
        description,
        supportsExchange: true,
        params,
        run: async (targets, args, exchange) => {
            if (!targets.dataStream) {
                throw new Error('This device has no data stream. Connect over AirPlay first.');
            }

            const message = build(args) as never;

            if (!exchange) {
                targets.dataStream.send(message);

                return null;
            }

            return await targets.dataStream.exchange(message);
        }
    };
}

function companionLink(id: string, title: string, category: string, description: string, params: readonly RawParam[], call: (target: CompanionLinkTarget, args: Args) => unknown): RawEntry {
    return {
        id,
        title,
        transport: 'companionLink',
        category,
        description,
        supportsExchange: false,
        params,
        run: async (targets, args) => {
            if (!targets.companionLink) {
                throw new Error('This device has no Companion Link session. Pair and connect first.');
            }

            return await call(targets.companionLink, args);
        }
    };
}

function controlStream(id: string, title: string, category: string, description: string, params: readonly RawParam[], call: (targets: RawTargets, args: Args) => unknown): RawEntry {
    return {
        id,
        title,
        transport: 'controlStream',
        category,
        description,
        supportsExchange: false,
        params,
        run: async (targets, args) => await call(targets, args)
    };
}

const DATA_STREAM_ENTRIES: readonly RawEntry[] = [
    dataStream('protocol', 'protocol', 'Protocol', 'A bare ProtocolMessage with a type and an error code, no extension attached.', [choice('type', 'Type', Proto.ProtocolMessage_Type, Proto.ProtocolMessage_Type.UNKNOWN_MESSAGE), choice('errorCode', 'Error code', Proto.ErrorCode_Enum, Proto.ErrorCode_Enum.NoError)], args =>
        Messages.protocol(asNumber(args, 'type'), asNumber(args, 'errorCode'))
    ),
    dataStream(
        'clientUpdatesConfig',
        'clientUpdatesConfig',
        'Session',
        'Subscribes to the update categories the device pushes.',
        [
            boolean('artworkUpdates', 'Artwork updates', true),
            boolean('nowPlayingUpdates', 'Now playing updates', true),
            boolean('volumeUpdates', 'Volume updates', true),
            boolean('keyboardUpdates', 'Keyboard updates', false),
            boolean('outputDeviceUpdates', 'Output device updates', false),
            boolean('systemEndpointUpdates', 'System endpoint updates', true)
        ],
        args =>
            Messages.clientUpdatesConfig(
                asBoolean(args, 'artworkUpdates'),
                asBoolean(args, 'nowPlayingUpdates'),
                asBoolean(args, 'volumeUpdates'),
                asBoolean(args, 'keyboardUpdates'),
                asBoolean(args, 'outputDeviceUpdates'),
                asBoolean(args, 'systemEndpointUpdates')
            )
    ),
    dataStream('configureConnection', 'configureConnection', 'Session', 'Attaches this connection to a multi-room group. Nothing in the SDK calls it.', [string('groupId', 'Group identifier')], args => Messages.configureConnection(asString(args, 'groupId'))),
    dataStream('setConnectionState', 'setConnectionState', 'Session', 'Reports whether this client considers itself connected.', [choice('state', 'State', Proto.SetConnectionStateMessage_ConnectionState, Proto.SetConnectionStateMessage_ConnectionState.Connected)], args =>
        Messages.setConnectionState(asNumber(args, 'state'))
    ),
    dataStream('setReadyState', 'setReadyState', 'Session', 'Tells the device this client is ready to receive state.', [], () => Messages.setReadyState()),
    dataStream('requestGroupSession', 'requestGroupSession', 'Session', 'Asks for a group session. Nothing in the SDK calls it.', [], () => Messages.requestGroupSession()),
    dataStream('getState', 'getState', 'State', 'Requests the full now playing state.', [], () => Messages.getState()),
    dataStream('notification', 'notification', 'State', 'Sends a free-form notification string. Nothing in the SDK calls it.', [string('notification', 'Notification')], args => Messages.notification(asString(args, 'notification'))),
    dataStream(
        'playbackQueueRequest',
        'playbackQueueRequest',
        'State',
        'Requests a window of the playback queue, which is also how artwork and lyrics arrive.',
        [number('location', 'Location', 0), number('length', 'Length', 10), number('artworkWidth', 'Artwork width', 600), number('artworkHeight', 'Artwork height', -1)],
        args => Messages.playbackQueueRequest(asNumber(args, 'location'), asNumber(args, 'length', 10), asNumber(args, 'artworkWidth', 600), asNumber(args, 'artworkHeight', -1))
    ),
    dataStream('sendCommand', 'sendCommand', 'Playback', 'Sends a transport command with no options.', [choice('command', 'Command', Proto.Command, Proto.Command.Play)], args => Messages.sendCommand(asNumber(args, 'command'))),
    dataStream('sendCommandWithSkipInterval', 'sendCommandWithSkipInterval', 'Playback', 'A skip command with its interval in seconds.', [choice('command', 'Command', Proto.Command, Proto.Command.SkipForward), number('skipInterval', 'Skip interval (s)', 15)], args =>
        Messages.sendCommandWithSkipInterval(asNumber(args, 'command'), asNumber(args, 'skipInterval', 15))
    ),
    dataStream('sendCommandWithPlaybackPosition', 'sendCommandWithPlaybackPosition', 'Playback', 'A seek command with an absolute position in seconds.', [choice('command', 'Command', Proto.Command, Proto.Command.SeekToPlaybackPosition), number('playbackPosition', 'Position (s)', 0)], args =>
        Messages.sendCommandWithPlaybackPosition(asNumber(args, 'command'), asNumber(args, 'playbackPosition'))
    ),
    dataStream('sendCommandWithPlaybackRate', 'sendCommandWithPlaybackRate', 'Playback', 'A rate change, where 0 pauses and 1 resumes.', [choice('command', 'Command', Proto.Command, Proto.Command.ChangePlaybackRate), number('playbackRate', 'Playback rate', 1)], args =>
        Messages.sendCommandWithPlaybackRate(asNumber(args, 'command'), asNumber(args, 'playbackRate', 1))
    ),
    dataStream('sendCommandWithShuffleMode', 'sendCommandWithShuffleMode', 'Playback', 'A shuffle mode change.', [choice('command', 'Command', Proto.Command, Proto.Command.ChangeShuffleMode), choice('shuffleMode', 'Shuffle mode', Proto.ShuffleMode_Enum, Proto.ShuffleMode_Enum.Off)], args =>
        Messages.sendCommandWithShuffleMode(asNumber(args, 'command'), asNumber(args, 'shuffleMode'))
    ),
    dataStream('sendCommandWithRepeatMode', 'sendCommandWithRepeatMode', 'Playback', 'A repeat mode change.', [choice('command', 'Command', Proto.Command, Proto.Command.ChangeRepeatMode), choice('repeatMode', 'Repeat mode', Proto.RepeatMode_Enum, Proto.RepeatMode_Enum.Off)], args =>
        Messages.sendCommandWithRepeatMode(asNumber(args, 'command'), asNumber(args, 'repeatMode'))
    ),
    dataStream('sendCommandWithSleepTimer', 'sendCommandWithSleepTimer', 'Playback', 'Arms the sleep timer.', [number('seconds', 'Seconds', 900), number('stopMode', 'Stop mode', 0)], args => Messages.sendCommandWithSleepTimer(asNumber(args, 'seconds', 900), asNumber(args, 'stopMode'))),
    dataStream('audioFade', 'audioFade', 'Playback', 'Requests an audio fade of the given type.', [number('fadeType', 'Fade type', 0)], args => Messages.audioFade(asNumber(args, 'fadeType'))),
    dataStream('playbackSessionMigrateBegin', 'playbackSessionMigrateBegin', 'Playback', 'Opens a playback session migration. Nothing in the SDK calls it.', [], () => Messages.playbackSessionMigrateBegin()),
    dataStream('playbackSessionMigrateEnd', 'playbackSessionMigrateEnd', 'Playback', 'Closes a playback session migration. Nothing in the SDK calls it.', [], () => Messages.playbackSessionMigrateEnd()),
    dataStream('getVolume', 'getVolume', 'Volume', 'Reads the volume of one output device.', [string('outputDeviceUID', 'Output device UID')], args => Messages.getVolume(asString(args, 'outputDeviceUID'))),
    dataStream('getVolumeMuted', 'getVolumeMuted', 'Volume', 'Reads the mute state of one output device. Nothing in the SDK calls it.', [string('outputDeviceUID', 'Output device UID')], args => Messages.getVolumeMuted(asString(args, 'outputDeviceUID'))),
    dataStream('setVolume', 'setVolume', 'Volume', 'Sets the volume of one output device, 0 to 1.', [string('outputDeviceUID', 'Output device UID'), number('volume', 'Volume (0-1)', 0.3)], args => Messages.setVolume(asString(args, 'outputDeviceUID'), asNumber(args, 'volume'))),
    dataStream('setVolumeMuted', 'setVolumeMuted', 'Volume', 'Mutes or unmutes one output device.', [string('outputDeviceUID', 'Output device UID'), boolean('isMuted', 'Muted', true)], args => Messages.setVolumeMuted(asString(args, 'outputDeviceUID'), asBoolean(args, 'isMuted'))),
    dataStream('adjustVolume', 'adjustVolume', 'Volume', 'Steps the volume up or down.', [choice('adjustment', 'Adjustment', Proto.AdjustVolumeMessage_Adjustment, Proto.AdjustVolumeMessage_Adjustment.IncrementSmall), string('outputDeviceUID', 'Output device UID')], args =>
        Messages.adjustVolume(asNumber(args, 'adjustment'), asString(args, 'outputDeviceUID'))
    ),
    dataStream('modifyOutputContext', 'modifyOutputContext', 'Multiroom', 'Adds, removes or replaces the devices in the output context.', [stringList('addingDevices', 'Adding'), stringList('removingDevices', 'Removing'), stringList('settingDevices', 'Setting')], args =>
        Messages.modifyOutputContext(asList(args, 'addingDevices'), asList(args, 'removingDevices'), asList(args, 'settingDevices'))
    ),
    dataStream('setDiscoveryMode', 'setDiscoveryMode', 'Multiroom', 'Changes the discovery mode. Nothing in the SDK calls it.', [number('mode', 'Mode', 0)], args => Messages.setDiscoveryMode(asNumber(args, 'mode'))),
    dataStream('getKeyboardSession', 'getKeyboardSession', 'Input', 'Requests the current keyboard session.', [], () => Messages.getKeyboardSession()),
    dataStream('textInput', 'textInput', 'Input', 'Sends text into the focused field.', [string('text', 'Text'), choice('actionType', 'Action type', Proto.ActionType_Enum, Proto.ActionType_Enum.Unknown)], args => Messages.textInput(asString(args, 'text'), asNumber(args, 'actionType'))),
    dataStream('sendButtonEvent', 'sendButtonEvent', 'Input', 'A raw HID button event. Nothing in the SDK calls it.', [number('usagePage', 'Usage page', 0x0c), number('usage', 'Usage', 0xb0), boolean('buttonDown', 'Button down', true)], args =>
        Messages.sendButtonEvent(asNumber(args, 'usagePage'), asNumber(args, 'usage'), asBoolean(args, 'buttonDown'))
    ),
    dataStream('sendHIDEvent', 'sendHIDEvent', 'Input', 'A HID usage page event, which is how remote control navigation is sent.', [number('usePage', 'Usage page', 0x01), number('usage', 'Usage', 0x8d), boolean('down', 'Down', true)], args =>
        Messages.sendHIDEvent(asNumber(args, 'usePage'), asNumber(args, 'usage'), asBoolean(args, 'down'))
    ),
    dataStream('registerHIDDevice', 'registerHIDDevice', 'Input', 'Claims a virtual touch device and answers with the identifier a touch event has to carry.', [number('screenWidth', 'Screen width', 1000), number('screenHeight', 'Screen height', 1000), boolean('absolute', 'Absolute', true), boolean('integratedDisplay', 'Integrated display', false)], args =>
        Messages.registerHIDDevice(asNumber(args, 'screenWidth', 1000), asNumber(args, 'screenHeight', 1000), asBoolean(args, 'absolute'), asBoolean(args, 'integratedDisplay'))
    ),
    dataStream('sendVirtualTouchEvent', 'sendVirtualTouchEvent', 'Input', 'A virtual trackpad touch.', [number('x', 'X', 0), number('y', 'Y', 0), number('phase', 'Phase', 1), number('finger', 'Finger', 1), number('deviceId', 'Device id', 1)], args =>
        Messages.sendVirtualTouchEvent(asNumber(args, 'x'), asNumber(args, 'y'), asNumber(args, 'phase', 1), asNumber(args, 'finger', 1), asNumber(args, 'deviceId', 1))
    ),
    dataStream('sendPackedVirtualTouchEvent', 'sendPackedVirtualTouchEvent', 'Input', 'The packed form of a virtual trackpad touch.', [number('x', 'X', 0), number('y', 'Y', 0), number('phase', 'Phase', 1), number('deviceId', 'Device id', 1), number('finger', 'Finger', 1)], args =>
        Messages.sendPackedVirtualTouchEvent(asNumber(args, 'x'), asNumber(args, 'y'), asNumber(args, 'phase', 1), asNumber(args, 'deviceId', 1), asNumber(args, 'finger', 1))
    ),
    dataStream('wakeDevice', 'wakeDevice', 'Power', 'Wakes the device over the data stream.', [], () => Messages.wakeDevice())
];

const COMPANION_LINK_ENTRIES: readonly RawEntry[] = [
    companionLink('cl.sleepDevice', 'power.sleep', 'Power', 'Puts the Apple TV to sleep.', [], target => target.power.sleep()),
    companionLink('cl.isAwake', 'power.isAwake', 'Power', 'Reports whether the Apple TV is awake.', [], target => target.power.isAwake()),
    companionLink('cl.playMedia', 'media.play', 'Media', 'Plays a media item described by a raw OPack object.', [json('item', 'Item', '{}', 'The OPack dictionary the Apple TV expects for this item.')], (target, args) => target.media.play(asRecord(args, 'item'))),
    companionLink('cl.fetchTopShelfItems', 'apps.topShelf', 'Media', 'Reads the top shelf items the Apple TV is showing.', [], target => target.apps.topShelf()),
    companionLink('cl.getSiriRemoteInfo', 'system.siriRemoteInfo', 'System', 'Reads what the Apple TV knows about the paired Siri Remote.', [], target => target.system.siriRemoteInfo()),
    companionLink('cl.getCaptionSetting', 'system.getCaptionSetting', 'System', 'Reads the closed captioning setting.', [], target => target.system.getCaptionSetting()),
    companionLink('cl.setCaptionSetting', 'system.setCaptionSetting', 'System', 'Turns closed captioning on or off.', [boolean('enabled', 'Enabled', true)], (target, args) => target.system.setCaptionSetting(asBoolean(args, 'enabled'))),
    companionLink('cl.gameControllerStart', 'hid.gameControllerStart', 'Game controller', 'Opens a game controller session.', [], target => target.hid.gameControllerStart()),
    companionLink('cl.gameControllerStop', 'hid.gameControllerStop', 'Game controller', 'Closes the game controller session.', [], target => target.hid.gameControllerStop()),
    companionLink('cl.sendGameControllerEvent', 'hid.sendGameControllerEvent', 'Game controller', 'Sends one analog stick position and button state.', [number('x', 'X (-1 to 1)', 0), number('y', 'Y (-1 to 1)', 0), boolean('isDown', 'Button down', false)], (target, args) =>
        target.hid.sendGameControllerEvent(asNumber(args, 'x'), asNumber(args, 'y'), asBoolean(args, 'isDown'))
    ),
    companionLink('cl.sendHidTouchEvent', 'touch.sendHid', 'Input', 'Sends one raw touch sample on the virtual trackpad.', [number('finger', 'Finger', 1), number('phase', 'Phase', 1), number('x', 'X', 0), number('y', 'Y', 0)], (target, args) =>
        target.touch.sendHid(asNumber(args, 'finger', 1), asNumber(args, 'phase', 1), asNumber(args, 'x'), asNumber(args, 'y'))
    ),
    companionLink('cl.requestAppSignIn', 'accounts.requestAppSignIn', 'Accounts', 'Starts the app sign-in proxy flow.', [string('bundleId', 'Bundle identifier'), string('requestType', 'Request type', 'appleID')], (target, args) => target.accounts.requestAppSignIn(asString(args, 'bundleId'), asString(args, 'requestType'))),
    companionLink('cl.requestTVProvider', 'accounts.requestTVProvider', 'Accounts', 'Starts a TV provider authentication flow.', [string('providerUrl', 'Provider URL'), string('providerName', 'Provider name')], (target, args) => target.accounts.requestTVProvider(asString(args, 'providerUrl'), asString(args, 'providerName'))),
    companionLink('cl.requestRestrictedAccess', 'accounts.requestRestrictedAccess', 'Accounts', 'Asks for a parental controls approval.', [string('restrictionType', 'Restriction type')], (target, args) => target.accounts.requestRestrictedAccess(asString(args, 'restrictionType'))),
    companionLink('cl.registerInterests', 'interests.register', 'Interests', 'Subscribes to event names of your choosing.', [stringList('events', 'Interests', ['_iMC', 'SystemStatus', 'TVSystemStatus'])], (target, args) => target.interests.register(asList(args, 'events'))),
    companionLink('cl.deregisterInterests', 'interests.deregister', 'Interests', 'Unsubscribes from event names.', [stringList('events', 'Interests', ['_iMC'])], (target, args) => target.interests.deregister(asList(args, 'events'))),
    {
        id: 'cl.exchange',
        title: 'stream.exchange',
        transport: 'companionLink',
        category: 'Raw',
        description: 'Sends an arbitrary OPack frame and waits for the correlated reply.',
        supportsExchange: false,
        params: [choice('frameType', 'Frame type', FrameType, FrameType.OPackEncrypted), json('payload', 'Payload', '{"_i": "_systemInfo"}', 'The OPack dictionary, `_i` being the message name.')],
        run: async (targets, args) => {
            if (!targets.companionLink) {
                throw new Error('This device has no Companion Link session. Pair and connect first.');
            }

            return await targets.companionLink.stream.exchange(asNumber(args, 'frameType'), asRecord(args, 'payload'));
        }
    }
];

const CONTROL_STREAM_ENTRIES: readonly RawEntry[] = [
    controlStream('cs.scrub', 'scrub', 'Playback', 'Seeks the URL playback session to a position in seconds.', [number('position', 'Position (s)', 0)], (targets, args) => callOn(targets.controlStream, 'controlStream', 'scrub', [asNumber(args, 'position')])),
    controlStream('cs.getProperty', 'getProperty', 'Properties', 'Reads one RTSP property.', [string('property', 'Property', 'volume')], (targets, args) => callOn(targets.controlStream, 'controlStream', 'getProperty', [asString(args, 'property')])),
    controlStream('cs.setProperty', 'setProperty', 'Properties', 'Writes one RTSP property with a plist body.', [string('property', 'Property', 'volume'), json('body', 'Body', '{}')], (targets, args) => callOn(targets.controlStream, 'controlStream', 'setProperty', [asString(args, 'property'), asRecord(args, 'body')])),
    controlStream('cs.setParameter', 'setParameter', 'Properties', 'Writes one text parameter, which is how stream volume is set.', [string('parameter', 'Parameter', 'volume'), string('value', 'Value', '-20')], (targets, args) =>
        callOn(targets.controlStream, 'controlStream', 'setParameter', [asString(args, 'parameter'), asString(args, 'value')])
    ),
    controlStream('cs.setAudioMode', 'setAudioMode', 'Audio', 'Switches the audio mode of the session.', [string('mode', 'Mode', 'default')], (targets, args) => callOn(targets.controlStream, 'controlStream', 'setAudioMode', [asString(args, 'mode')])),
    controlStream('cs.flushBuffered', 'flushBuffered', 'Audio', 'Flushes the buffered audio for a URI.', [string('uri', 'URI', '*'), json('headers', 'Headers', '{}')], (targets, args) => callOn(targets.controlStream, 'controlStream', 'flushBuffered', [asString(args, 'uri'), asRecord(args, 'headers')])),
    controlStream('cs.feedback', 'feedback', 'Session', 'Sends the keepalive the receiver expects every two seconds.', [json('stats', 'Stats', '{}')], (targets, args) => callOn(targets.controlStream, 'controlStream', 'feedback', [asRecord(args, 'stats')])),
    controlStream('cs.getPlaybackInfo', 'GET /playback-info', 'Session', 'Reads the playback info the receiver reports on the control stream.', [], async targets => await readPlaybackInfo(targets.controlStream))
];

/** Parses the `/playback-info` plist: empty when nothing plays, null when the receiver refuses. */
async function readPlaybackInfo(target: ControlStreamTarget | undefined): Promise<unknown> {
    const response = await callOn(target, 'controlStream', 'get', ['/playback-info']) as Response;

    if (!response.ok) {
        return null;
    }

    const body = await response.arrayBuffer();

    return body.byteLength === 0 ? {} : Plist.parse(body);
}

function callOn(target: ControlStreamTarget | undefined, name: string, method: string, args: readonly unknown[]): unknown {
    if (!target) {
        throw new Error(`This device has no ${name}. Connect over AirPlay first.`);
    }

    const member = target[method];

    if (typeof member !== 'function') {
        throw new Error(`'${method}' is not available on the ${name}.`);
    }

    return member.apply(target, args as never[]);
}

export const RAW_ENTRIES: readonly RawEntry[] = [...DATA_STREAM_ENTRIES, ...COMPANION_LINK_ENTRIES, ...CONTROL_STREAM_ENTRIES];

export const RAW_CATALOG: readonly RawBuilderInfo[] = RAW_ENTRIES.map(({id, title, transport, category, description, supportsExchange, params}) => ({id, title, transport, category, description, supportsExchange, params}));

export function rawEntry(transport: RawTransport, id: string): RawEntry {
    const entry = RAW_ENTRIES.find(candidate => candidate.id === id && candidate.transport === transport);

    if (!entry) {
        throw new Error(`No '${transport}' builder named '${id}'.`);
    }

    return entry;
}

export function validateRawRequest(request: RawMessageRequest): void {
    const entry = rawEntry(request.transport, request.id);

    if (!request.args || typeof request.args !== 'object' || Array.isArray(request.args)) {
        throw new Error('Raw arguments must be an object.');
    }

    for (const name of Object.keys(request.args)) {
        if (!entry.params.some(param => param.name === name)) {
            throw new Error(`Unknown raw argument '${name}'.`);
        }
    }

    for (const param of entry.params) {
        const value = request.args[param.name];

        if (value === undefined && (param.optional || param.defaultValue !== undefined)) {
            continue;
        }

        let valid = false;

        switch (param.type) {
            case 'number':
                valid = typeof value === 'number' && Number.isFinite(value);
                break;

            case 'boolean':
                valid = typeof value === 'boolean';
                break;

            case 'string':
                valid = typeof value === 'string';
                break;

            case 'enum':
                valid = param.options?.some(option => option.value === value) === true;
                break;

            case 'stringList':
                valid = Array.isArray(value) && value.every(item => typeof item === 'string');
                break;

            case 'json': {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                valid = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
                break;
            }
        }

        if (!valid) {
            throw new Error(`Invalid raw argument '${param.name}': expected ${param.type}.`);
        }
    }
}
