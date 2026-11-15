import { OPack } from '@corewire/core/encoding';
import { MediaControlCommand } from './const';
import { MessageType } from './frame';

/** An OPack message for the Companion Link stream. */
export type OPackMessage = Record<string, unknown>;

/** A request; the device replies. */
function request(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _c: content };
}

/** A request with Bluetooth high priority off (`_btHP: false`), for messages that should not cause a Bluetooth wake. */
function requestBtHP(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _btHP: false, _c: content };
}

/** An event; the device sends no reply. */
function event(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Event, _c: content };
}

/** The `_systemInfo` request of the startup: the identity, model and services of this controller. */
export function systemInfo(pairingId: Buffer, name: string, model: string = 'iPhone16,2', sourceVersion: string = '715.2'): OPackMessage {
    return requestBtHP('_systemInfo', {
        // _bf: build flags, _cf: capability flags, _clFl: Companion Link flags
        _bf: 0,
        _cf: 512,
        _clFl: 128,
        // Fixed identifiers, because random ones make the Apple TV see a new remote on every connection.
        // todo: persist them per controller.
        // _i: device id (MAC-like), _pubID: public Bluetooth MAC address,
        // _sf: supported features bitmask, _lP: local port, _dC: device category
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

/** Starts a session with the `com.apple.tvremoteservices` service under a session id of our own. */
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

/** Starts a TV Remote Control session, which `tvremoted` handles on the Apple TV. */
export function tvrcSessionStart(): OPackMessage {
    return { _i: 'TVRCSessionStart', _t: MessageType.Request, _btHP: false, _inUseProc: 'tvremoted', _c: { ProtocolVersionKey: '1.2' } };
}

export function tvrcSessionStop(): OPackMessage {
    return request('TVRCSessionStop');
}

/** One button edge of a {@link HidCommand}; `down` false sends the release. */
export function hidCommand(commandId: number, down: boolean): OPackMessage {
    return request('_hidC', { _hBtS: down ? 1 : 2, _hidC: commandId });
}

/** Starts the virtual touchpad; the size sets its coordinate space. */
export function touchStart(width: number = 1000.0, height: number = 1000.0): OPackMessage {
    return requestBtHP('_touchStart', { _height: OPack.float(height), _tFl: 0, _width: OPack.float(width) });
}

export function touchStop(): OPackMessage {
    return request('_touchStop', { _i: 1 });
}

/**
 * A `_touchC` event, in the coordinate space of the touchpad.
 *
 * @param finger - 0-based.
 * @param phase - See {@link TouchPhase}.
 */
export function touchEvent(finger: number, phase: number, x: number, y: number): OPackMessage {
    return event('_touchC', { _tFg: finger, _tPh: phase, _tX: OPack.float(x), _tY: OPack.float(y) });
}

/**
 * A `_hidT` event, the form an Apple remote sends touchpad gestures in on the wire. Unlike
 * {@link touchEvent}, the coordinates are integers and the event carries a timestamp.
 *
 * @param finger - 1-based.
 * @param phase - See {@link HidTouchPhase}.
 * @param timestamp - Monotonic, in nanoseconds.
 */
export function hidTouchEvent(finger: number, phase: number, x: number, y: number, timestamp: number = Number(process.hrtime.bigint())): OPackMessage {
    return event('_hidT', { _ns: OPack.sizedInteger(timestamp, 8), _tFg: finger, _cx: Math.round(x), _tPh: phase, _cy: Math.round(y) });
}

/** Starts remote text input (RTI); the reply carries the keyboard session. */
export function tiStart(): OPackMessage {
    return requestBtHP('_tiStart', {_tiV: 1});
}

export function tiStop(): OPackMessage {
    return requestBtHP('_tiStop');
}

/** A `_tiC` event with serialized RTITextOperations. */
export function tiChange(tiD: Buffer): OPackMessage {
    return event('_tiC', { _tiV: 1, _tiD: tiD });
}

/**
 * A `_mcc` request.
 *
 * @param commandId - From {@link MediaControlCommand}.
 * @param content - Extra fields, such as the volume for `SetVolume`.
 */
export function mediaControlCommand(commandId: number, content?: Record<string, unknown>): OPackMessage {
    return request('_mcc', {_mcc: commandId, ...(content ?? {})});
}

/** Skips forward, or backward for a negative number of seconds. */
export function mediaSkipBySeconds(seconds: number): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.SkipBy, _ski: seconds});
}

export function mediaCaptionSettingGet(): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.GetCaptionSettings});
}

export function mediaCaptionSettingSet(enabled: boolean): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.SetCaptionSettings, _cse: enabled});
}

export function launchApp(bundleId: string): OPackMessage {
    return request('_launchApp', { _bundleID: bundleId });
}

/** Opens a URL; the device picks the app through universal links. */
export function launchUrl(url: string): OPackMessage {
    return request('_launchApp', { _urlS: url });
}

/** Asks for the attention (power) state. */
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

export function fetchSupportedActions(): OPackMessage {
    return request('FetchSupportedActionsEvent');
}

export function fetchCurrentTopShelfItems(): OPackMessage {
    return requestBtHP('FetchCurrentTopShelfItemsEvent');
}

export function fetchUserAccounts(): OPackMessage {
    return request('FetchUserAccountsEvent');
}

export function switchUserAccount(accountId: string): OPackMessage {
    return request('SwitchUserAccountEvent', { SwitchAccountID: accountId });
}

/**
 * Tells the Apple TV which iCloud account (alternate DSID) this controller is active on. An iOS
 * remote sends it during the startup.
 */
export function switchActiveUserAccount(iCloudAltDSID: string): OPackMessage {
    return requestBtHP('SwitchActiveUserAccountEvent', { iCloudAltDSID });
}

/** Registers interest in events the device pushes, such as `_iMC` or `SystemStatus`. */
export function registerInterests(events: string[]): OPackMessage {
    return event('_interest', { _regEvents: events });
}

export function deregisterInterests(events: string[]): OPackMessage {
    return event('_interest', { _deregEvents: events });
}

export function toggleCaptions(): OPackMessage {
    return request('ToggleCaptions');
}

/** Light appearance when `light` is true, dark when false. */
export function toggleSystemAppearance(light: boolean): OPackMessage {
    return request('ToggleSystemAppearance', { SystemAppearanceLight: light });
}

export function toggleReduceLoudSounds(enabled: boolean): OPackMessage {
    // The protocol key is misspelled `ReduceLoundSoundsEnabled`; keep that spelling.
    return request('ToggleReduceLoudSounds', { ReduceLoundSoundsEnabled: enabled });
}

/** The Find My finding mode. */
export function toggleFindingMode(enabled: boolean): OPackMessage {
    return request('ToggleFindingMode', { FindingModeEnabledKey: enabled });
}

/** @param paginationToken - Fetches the page after the one that returned it. */
export function fetchUpNext(paginationToken?: string): OPackMessage {
    return request('FetchUpNextInfoEvent', paginationToken ? { PaginationTokenKey: paginationToken } : {});
}

/** @param kind - Such as movie or episode. */
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

/** Push-to-talk begin. */
export function siriStart(): OPackMessage {
    return request('_siriStart');
}

/** Push-to-talk end. */
export function siriStop(): OPackMessage {
    return request('_siriStop');
}

/** One stick position (-1 to 1 per axis) and the button state, as an event without a reply. */
export function gameControllerEvent(x: number, y: number, isDown: boolean): OPackMessage {
    return event('_gcC', {_gcX: x, _gcY: y, _gcBtS: isDown ? 1 : 0});
}

export function gameControllerStart(): OPackMessage {
    return requestBtHP('_gcStart');
}

export function gameControllerStop(): OPackMessage {
    return requestBtHP('_gcStop');
}

/**
 * Runs the sign-in of an Apple TV app through this controller, as a paired iPhone or iPad does.
 *
 * @param requestType - `appleID`, `password` or `custom`.
 */
export function appSignInRequest(bundleId: string, requestType: string = 'appleID'): OPackMessage {
    return request('_cpsAISR', {_bundleID: bundleId, _reqType: requestType});
}

/** A TV provider (MVPD) sign-in request. */
export function tvProviderRequest(providerUrl: string, providerName: string): OPackMessage {
    return request('_cpsTVPR', {_pvUrl: providerUrl, _pvName: providerName});
}

/** A restricted access (parental controls) approval request. */
export function restrictedAccessRequest(restrictionType: string): OPackMessage {
    return request('_cpsRAR', {_raType: restrictionType});
}
