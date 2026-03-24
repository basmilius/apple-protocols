import { OPack, Plist } from '@basmilius/apple-encoding';
import { MessageType } from './frame';

type OPackMessage = Record<string, unknown>;

function UID(n: number): { 'CF$UID': number } {
    return { 'CF$UID': n };
}

function request(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _c: content };
}

function requestBtHP(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _btHP: false, _c: content };
}

function event(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Event, _c: content };
}

// --- System & Session ---

export function systemInfo(pairingId: Buffer, name: string = 'AP Companion Link', model: string = 'iPhone16,2', sourceVersion: string = '715.2'): OPackMessage {
    return requestBtHP('_systemInfo', {
        _bf: 0,
        _cf: 512,
        _clFl: 128,
        _i: 'b561af32aea6',
        _idsID: pairingId.toString(),
        _pubID: 'DA:6D:1E:D8:A0:4F',
        _sf: 1099511628032,
        _sv: sourceVersion,
        model,
        name,
        _lP: 50402,
        _dC: '1',
        _stA: [
            'com.apple.sharingd.AirDrop',
            'SymptomNetworkDiagnostics',
            'com.apple.photosface.network-service',
            'com.apple.ApplicationService.chrono',
            'com.apple.DDUI-Picker',
            'com.apple.biomesyncd.cascade.rapport',
            'com.apple.SeymourSession',
            'com.apple.workflow.remotewidgets',
            'com.apple.ApplicationService.chrono',
            'SCD.MessageCenter.remoteIntelligence',
            'DeviceSharingDaemonApplicationService',
            'com.apple.biomesyncd.rapport',
            'com.apple.devicediscoveryui.rapportwake',
            'com.apple.healthd.rapport',
            'com.apple.dropin.setup',
            'com.apple.coreduet.sync',
            'com.apple.siri.wakeup',
            'com.apple.wifivelocityd.rapportWake',
            'com.apple.Seymour',
            'CPSRemoteLLM',
            'com.apple.networkrelay.on-demand-setup',
            'com.apple.home.messaging',
            'com.apple.accessibility.axremoted.rapportWake',
            'com.apple.continuitycapture.sideband',
            'com.apple.announce',
            'com.apple.coreidv.coreidvd.handoff'
        ]
    });
}

export function sessionStart(localSid: number): OPackMessage {
    return {
        _i: '_sessionStart',
        _t: MessageType.Request,
        _btHP: false,
        _c: { _srvT: 'com.apple.tvremoteservices', _sid: localSid, _btHP: false }
    };
}

export function sessionStop(localSid: number): OPackMessage {
    return request('_sessionStop', { _srvT: 'com.apple.tvremoteservices', _sid: localSid });
}

export function tvrcSessionStart(): OPackMessage {
    return { _i: 'TVRCSessionStart', _t: MessageType.Request, _btHP: false, _inUseProc: 'tvremoted', _c: {} };
}

export function tvrcSessionStop(): OPackMessage {
    return request('TVRCSessionStop');
}

export function ping(): OPackMessage {
    return request('_ping');
}

// --- HID Commands ---

export function hidCommand(commandId: number, down: boolean): OPackMessage {
    return request('_hidC', { _hBtS: down ? 1 : 2, _hidC: commandId });
}

// --- Touch ---

export function touchStart(width: number = 1000.0, height: number = 1000.0): OPackMessage {
    return requestBtHP('_touchStart', { _height: OPack.float(height), _tFl: 0, _width: OPack.float(width) });
}

export function touchStop(): OPackMessage {
    return request('_touchStop', { _i: 1 });
}

export function touchEvent(finger: number, phase: number, x: number, y: number): OPackMessage {
    return request('_touchC', { _tFg: finger, _tPh: phase, _tX: OPack.float(x), _tY: OPack.float(y) });
}

// --- Text Input ---

export function tiStart(): OPackMessage {
    return requestBtHP('_tiStart');
}

export function tiStop(): OPackMessage {
    return requestBtHP('_tiStop');
}

export function tiChange(tiD: Buffer): OPackMessage {
    return event('_tiC', { _tiV: 1, _tiD: tiD });
}

export function buildRtiClearPayload(sessionUUID: Buffer): ArrayBuffer {
    return Plist.serialize({
        '$version': 100000,
        '$archiver': 'RTIKeyedArchiver',
        '$top': { textOperations: UID(1) },
        '$objects': [
            '$null',
            { '$class': UID(7), targetSessionUUID: UID(5), keyboardOutput: UID(2), textToAssert: UID(4) },
            { '$class': UID(3) },
            { '$classname': 'TIKeyboardOutput', '$classes': ['TIKeyboardOutput', 'NSObject'] },
            '',
            { 'NS.uuidbytes': sessionUUID.buffer.slice(sessionUUID.byteOffset, sessionUUID.byteOffset + sessionUUID.byteLength) as ArrayBuffer, '$class': UID(6) },
            { '$classname': 'NSUUID', '$classes': ['NSUUID', 'NSObject'] },
            { '$classname': 'RTITextOperations', '$classes': ['RTITextOperations', 'NSObject'] }
        ]
    } as any) as ArrayBuffer;
}

export function buildRtiInputPayload(sessionUUID: Buffer, text: string): ArrayBuffer {
    return Plist.serialize({
        '$version': 100000,
        '$archiver': 'RTIKeyedArchiver',
        '$top': { textOperations: UID(1) },
        '$objects': [
            '$null',
            { keyboardOutput: UID(2), '$class': UID(7), targetSessionUUID: UID(5) },
            { insertionText: UID(3), '$class': UID(4) },
            text,
            { '$classname': 'TIKeyboardOutput', '$classes': ['TIKeyboardOutput', 'NSObject'] },
            { 'NS.uuidbytes': sessionUUID.buffer.slice(sessionUUID.byteOffset, sessionUUID.byteOffset + sessionUUID.byteLength) as ArrayBuffer, '$class': UID(6) },
            { '$classname': 'NSUUID', '$classes': ['NSUUID', 'NSObject'] },
            { '$classname': 'RTITextOperations', '$classes': ['RTITextOperations', 'NSObject'] }
        ]
    } as any) as ArrayBuffer;
}

// --- Media Control ---

export function mediaControlCommand(commandId: number, content?: Record<string, unknown>): OPackMessage {
    return request('_mcc', { _mcc: commandId, ...(content ?? {}) });
}

// --- App Launch ---

export function launchApp(bundleId: string): OPackMessage {
    return request('_launchApp', { _bundleID: bundleId });
}

export function launchUrl(url: string): OPackMessage {
    return request('_launchApp', { _urlS: url });
}

// --- Fetchers ---

export function fetchAttentionState(): OPackMessage {
    return request('FetchAttentionState');
}

export function fetchLaunchableApps(): OPackMessage {
    return request('FetchLaunchableApplicationsEvent');
}

export function fetchMediaControlStatus(): OPackMessage {
    return request('FetchMediaControlStatus');
}

export function fetchNowPlayingInfo(): OPackMessage {
    return request('FetchCurrentNowPlayingInfoEvent');
}

export function fetchSiriRemoteInfo(): OPackMessage {
    return request('FetchSiriRemoteInfo');
}

export function fetchSiriStatus(): OPackMessage {
    return request('FetchSiriStatus');
}

export function fetchSupportedActions(): OPackMessage {
    return request('FetchSupportedActionsEvent');
}

export function fetchUserAccounts(): OPackMessage {
    return request('FetchUserAccountsEvent');
}

// --- Account ---

export function switchUserAccount(accountId: string): OPackMessage {
    return request('SwitchUserAccountEvent', { SwitchAccountID: accountId });
}

// --- Interests ---

export function registerInterests(events: string[]): OPackMessage {
    return event('_interest', { _regEvents: events });
}

export function deregisterInterests(events: string[]): OPackMessage {
    return event('_interest', { _deregEvents: events });
}

// --- System Controls ---

export function toggleCaptions(): OPackMessage {
    return request('ToggleCaptions');
}

export function toggleSystemAppearance(light: boolean): OPackMessage {
    return request('ToggleSystemAppearance', { SystemAppearanceLight: light });
}

export function toggleReduceLoudSounds(enabled: boolean): OPackMessage {
    return request('ToggleReduceLoudSounds', { ReduceLoundSoundsEnabled: enabled });
}

export function toggleFindingMode(enabled: boolean): OPackMessage {
    return request('ToggleFindingMode', { FindingModeEnabledKey: enabled });
}

// --- Up Next Management ---

export function fetchUpNext(paginationToken?: string): OPackMessage {
    return request('FetchUpNextInfoEvent', paginationToken ? { PaginationTokenKey: paginationToken } : {});
}

export function addToUpNext(identifier: string, kind: string): OPackMessage {
    return request('AddToUpNextEvent', { IdentifierKey: identifier, KindKey: kind });
}

export function removeFromUpNext(identifier: string, kind: string): OPackMessage {
    return request('RemoveFromUpNextEvent', { IdentifierKey: identifier, KindKey: kind });
}

export function markAsWatched(identifier: string, kind: string): OPackMessage {
    return request('MarkAsWatchedEvent', { IdentifierKey: identifier, KindKey: kind });
}

export function playMedia(item: Record<string, unknown>): OPackMessage {
    return request('PlayMediaEvent', item);
}

// --- Siri ---

export function siriStart(): OPackMessage {
    return request('_siriStart');
}

export function siriStop(): OPackMessage {
    return request('_siriStop');
}

// --- Presence ---

export function publishPresence(): OPackMessage {
    return request('PublishPresenceEvent');
}
