import { OPack, Plist } from '@basmilius/apple-encoding';
import { MediaControlCommand } from './const';
import { MessageType } from './frame';

/** An OPack-encoded message to be sent over the Companion Link stream. */
type OPackMessage = Record<string, unknown>;

/**
 * Creates a Core Foundation UID reference for NSKeyedArchiver payloads.
 *
 * @param n - The index into the `$objects` array.
 * @returns A `CF$UID` reference object.
 */
function UID(n: number): { 'CF$UID': number } {
    return { 'CF$UID': n };
}

/**
 * Creates a standard Companion Link request message.
 *
 * @param identifier - The message identifier (e.g. `_ping`, `_hidC`).
 * @param content - Optional content payload for the `_c` field.
 * @returns The constructed OPack message.
 */
function request(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _c: content };
}

/**
 * Creates a Companion Link request message with Bluetooth high-priority disabled.
 * Used for messages that should not trigger Bluetooth wake behavior.
 *
 * @param identifier - The message identifier.
 * @param content - Optional content payload for the `_c` field.
 * @returns The constructed OPack message with `_btHP: false`.
 */
function requestBtHP(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Request, _btHP: false, _c: content };
}

/**
 * Creates a Companion Link event message (fire-and-forget, no response expected).
 *
 * @param identifier - The message identifier.
 * @param content - Optional content payload for the `_c` field.
 * @returns The constructed OPack event message.
 */
function event(identifier: string, content: Record<string, unknown> = {}): OPackMessage {
    return { _i: identifier, _t: MessageType.Event, _c: content };
}

// --- System & Session ---

/**
 * Builds the `_systemInfo` message sent during the initial handshake.
 * Announces the controller's identity, model and supported services to the Apple TV.
 *
 * @param pairingId - The controller's pairing identifier.
 * @param name - Display name of this controller.
 * @param model - Device model identifier (e.g. `iPhone16,2`).
 * @param sourceVersion - Protocol source version string.
 * @returns The system info request message.
 */
export function systemInfo(pairingId: Buffer, name: string = 'AP Companion Link', model: string = 'iPhone16,2', sourceVersion: string = '715.2'): OPackMessage {
    return requestBtHP('_systemInfo', {
        // _bf: build flags, _cf: capability flags, _clFl: Companion Link flags
        _bf: 0,
        _cf: 512,
        _clFl: 128,
        // TODO: These identifiers are hardcoded. Ideally they should be persisted per-controller
        // so the Apple TV recognizes the same remote across sessions. Using random IDs causes the
        // Apple TV to treat each connection as a new remote.
        // _i: device identifier (MAC-like), _pubID: public Bluetooth MAC address,
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

/**
 * Builds a session start request for the `com.apple.tvremoteservices` service.
 *
 * @param localSid - The locally generated session identifier.
 * @returns The session start request message.
 */
export function sessionStart(localSid: number): OPackMessage {
    return {
        _i: '_sessionStart',
        _t: MessageType.Request,
        _btHP: false,
        _c: { _srvT: 'com.apple.tvremoteservices', _sid: localSid, _btHP: false }
    };
}

/**
 * Builds a session stop request to terminate the active service session.
 *
 * @param localSid - The local session identifier to terminate.
 * @returns The session stop request message.
 */
export function sessionStop(localSid: number): OPackMessage {
    return request('_sessionStop', { _srvT: 'com.apple.tvremoteservices', _sid: localSid });
}

/**
 * Builds a TV Remote Control session start request.
 * Initiates the `tvremoted` process on the Apple TV for remote interaction.
 *
 * @returns The TVRC session start request message.
 */
export function tvrcSessionStart(): OPackMessage {
    return { _i: 'TVRCSessionStart', _t: MessageType.Request, _btHP: false, _inUseProc: 'tvremoted', _c: {} };
}

/**
 * Builds a TV Remote Control session stop request.
 *
 * @returns The TVRC session stop request message.
 */
export function tvrcSessionStop(): OPackMessage {
    return request('TVRCSessionStop');
}

/**
 * Builds a keepalive ping message.
 *
 * @returns The ping request message.
 */
export function ping(): OPackMessage {
    return request('_ping');
}

// --- HID Commands ---

/**
 * Builds a HID button command message for remote control input.
 *
 * @param commandId - The HID command identifier from {@link HidCommand}.
 * @param down - Whether this is a button-down (`true`) or button-up (`false`) event.
 * @returns The HID command request message.
 */
export function hidCommand(commandId: number, down: boolean): OPackMessage {
    return request('_hidC', { _hBtS: down ? 1 : 2, _hidC: commandId });
}

// --- Touch ---

/**
 * Builds a touch session start message to initialize the virtual touchpad.
 *
 * @param width - Width of the virtual touchpad coordinate space.
 * @param height - Height of the virtual touchpad coordinate space.
 * @returns The touch start request message.
 */
export function touchStart(width: number = 1000.0, height: number = 1000.0): OPackMessage {
    return requestBtHP('_touchStart', { _height: OPack.float(height), _tFl: 0, _width: OPack.float(width) });
}

/**
 * Builds a touch session stop message to end the virtual touchpad.
 *
 * @returns The touch stop request message.
 */
export function touchStop(): OPackMessage {
    return request('_touchStop', { _i: 1 });
}

/**
 * Builds a touch event message with finger position and phase.
 *
 * @param finger - The finger index (0-based, supports multi-touch).
 * @param phase - The touch phase (see {@link TouchPhase}).
 * @param x - Horizontal position in the virtual touchpad coordinate space.
 * @param y - Vertical position in the virtual touchpad coordinate space.
 * @returns The touch event request message.
 */
export function touchEvent(finger: number, phase: number, x: number, y: number): OPackMessage {
    return event('_touchC', { _tFg: finger, _tPh: phase, _tX: OPack.float(x), _tY: OPack.float(y) });
}

// --- Text Input ---

/**
 * Builds a text input session start message.
 * Initiates RTI (Remote Text Input) to receive keyboard session info from the Apple TV.
 *
 * @returns The text input start request message.
 */
export function tiStart(): OPackMessage {
    return requestBtHP('_tiStart', {_tiV: 1});
}

/**
 * Builds a text input session stop message.
 *
 * @returns The text input stop request message.
 */
export function tiStop(): OPackMessage {
    return requestBtHP('_tiStop');
}

/**
 * Builds a text input change event containing an RTI payload.
 * Sent as a fire-and-forget event (no response expected).
 *
 * @param tiD - The serialized RTI (RTITextOperations) payload.
 * @returns The text input change event message.
 */
export function tiChange(tiD: Buffer): OPackMessage {
    return event('_tiC', { _tiV: 1, _tiD: tiD });
}

/**
 * Builds an NSKeyedArchiver-encoded RTI payload that clears the current text input.
 * Uses `TIKeyboardOutput` with an empty `textToAssert` to reset the field.
 *
 * @param sessionUUID - The 16-byte UUID of the active keyboard session.
 * @returns The binary plist payload ready to be sent via {@link tiChange}.
 */
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

/**
 * Builds an NSKeyedArchiver-encoded RTI payload that inserts text into the active input field.
 * Uses `TIKeyboardOutput` with `insertionText` to type the given string.
 *
 * @param sessionUUID - The 16-byte UUID of the active keyboard session.
 * @param text - The text to insert into the input field.
 * @returns The binary plist payload ready to be sent via {@link tiChange}.
 */
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

/**
 * Builds a media control command message.
 *
 * @param commandId - The media control command identifier from {@link MediaControlCommand}.
 * @param content - Optional additional content (e.g. volume level for SetVolume).
 * @returns The media control request message.
 */
export function mediaControlCommand(commandId: number, content?: Record<string, unknown>): OPackMessage {
    return request('_mcc', {_mcc: commandId, ...(content ?? {})});
}

/**
 * Builds a media control command to skip forward or backward by a given number of seconds.
 *
 * @param seconds - Number of seconds to skip (positive = forward, negative = backward).
 * @returns The skip-by-seconds request message.
 */
export function mediaSkipBySeconds(seconds: number): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.SkipBy, _ski: seconds});
}

/**
 * Builds a message to get the current caption/subtitle settings.
 *
 * @returns The get caption settings request message.
 */
export function mediaCaptionSettingGet(): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.GetCaptionSettings});
}

/**
 * Builds a message to enable or disable captions/subtitles.
 *
 * @param enabled - Whether captions should be enabled.
 * @returns The set caption settings request message.
 */
export function mediaCaptionSettingSet(enabled: boolean): OPackMessage {
    return request('_mcc', {_mcc: MediaControlCommand.SetCaptionSettings, _cse: enabled});
}

// --- App Launch ---

/**
 * Builds a message to launch an app by its bundle identifier.
 *
 * @param bundleId - The bundle identifier of the app to launch (e.g. `com.apple.TVMovies`).
 * @returns The app launch request message.
 */
export function launchApp(bundleId: string): OPackMessage {
    return request('_launchApp', { _bundleID: bundleId });
}

/**
 * Builds a message to open a URL on the Apple TV, which will launch the
 * appropriate app via universal links.
 *
 * @param url - The URL to open.
 * @returns The URL launch request message.
 */
export function launchUrl(url: string): OPackMessage {
    return request('_launchApp', { _urlS: url });
}

// --- Fetchers ---

/**
 * Builds a request to fetch the Apple TV's current attention (power) state.
 *
 * @returns The attention state fetch request message.
 */
export function fetchAttentionState(): OPackMessage {
    return request('FetchAttentionState');
}

/**
 * Builds a request to fetch the list of launchable apps on the Apple TV.
 *
 * @returns The launchable apps fetch request message.
 */
export function fetchLaunchableApps(): OPackMessage {
    return request('FetchLaunchableApplicationsEvent');
}

/**
 * Builds a request to fetch the current media control capabilities and status.
 *
 * @returns The media control status fetch request message.
 */
export function fetchMediaControlStatus(): OPackMessage {
    return request('FetchMediaControlStatus');
}

/**
 * Builds a request to fetch the current now-playing information.
 *
 * @returns The now-playing info fetch request message.
 */
export function fetchNowPlayingInfo(): OPackMessage {
    return request('FetchCurrentNowPlayingInfoEvent');
}

/**
 * Builds a request to fetch Siri Remote hardware/configuration info.
 *
 * @returns The Siri Remote info fetch request message.
 */
export function fetchSiriRemoteInfo(): OPackMessage {
    return request('FetchSiriRemoteInfo');
}

/**
 * Builds a request to fetch the current Siri activation status.
 *
 * @returns The Siri status fetch request message.
 */
export function fetchSiriStatus(): OPackMessage {
    return request('FetchSiriStatus');
}

/**
 * Builds a request to fetch the list of currently supported remote actions.
 *
 * @returns The supported actions fetch request message.
 */
export function fetchSupportedActions(): OPackMessage {
    return request('FetchSupportedActionsEvent');
}

/**
 * Builds a request to fetch the user accounts registered on the Apple TV.
 *
 * @returns The user accounts fetch request message.
 */
export function fetchUserAccounts(): OPackMessage {
    return request('FetchUserAccountsEvent');
}

// --- Account ---

/**
 * Builds a request to switch the active user account on the Apple TV.
 *
 * @param accountId - The identifier of the account to switch to.
 * @returns The switch user account request message.
 */
export function switchUserAccount(accountId: string): OPackMessage {
    return request('SwitchUserAccountEvent', { SwitchAccountID: accountId });
}

// --- Interests ---

/**
 * Builds an event to subscribe to specific server-sent events.
 *
 * @param events - The event identifiers to subscribe to (e.g. `_iMC`, `SystemStatus`).
 * @returns The interest registration event message.
 */
export function registerInterests(events: string[]): OPackMessage {
    return event('_interest', { _regEvents: events });
}

/**
 * Builds an event to unsubscribe from specific server-sent events.
 *
 * @param events - The event identifiers to unsubscribe from.
 * @returns The interest deregistration event message.
 */
export function deregisterInterests(events: string[]): OPackMessage {
    return event('_interest', { _deregEvents: events });
}

// --- System Controls ---

/**
 * Builds a request to toggle closed captions on the Apple TV.
 *
 * @returns The toggle captions request message.
 */
export function toggleCaptions(): OPackMessage {
    return request('ToggleCaptions');
}

/**
 * Builds a request to toggle the system appearance (light/dark mode).
 *
 * @param light - Whether to switch to light mode (`true`) or dark mode (`false`).
 * @returns The toggle appearance request message.
 */
export function toggleSystemAppearance(light: boolean): OPackMessage {
    return request('ToggleSystemAppearance', { SystemAppearanceLight: light });
}

/**
 * Builds a request to toggle the "Reduce Loud Sounds" audio setting.
 *
 * @param enabled - Whether to enable (`true`) or disable (`false`) the feature.
 * @returns The toggle reduce loud sounds request message.
 */
export function toggleReduceLoudSounds(enabled: boolean): OPackMessage {
    // NOTE: The key 'ReduceLoundSoundsEnabled' contains a typo ('Lound' instead of 'Loud'),
    // but this is the actual protocol key used by Apple's implementation. Do not correct it.
    return request('ToggleReduceLoudSounds', { ReduceLoundSoundsEnabled: enabled });
}

/**
 * Builds a request to toggle Finding Mode (Find My) on the Apple TV.
 *
 * @param enabled - Whether to enable (`true`) or disable (`false`) finding mode.
 * @returns The toggle finding mode request message.
 */
export function toggleFindingMode(enabled: boolean): OPackMessage {
    return request('ToggleFindingMode', { FindingModeEnabledKey: enabled });
}

// --- Up Next Management ---

/**
 * Builds a request to fetch the Up Next queue from the Apple TV.
 *
 * @param paginationToken - Optional token to fetch the next page of results.
 * @returns The Up Next fetch request message.
 */
export function fetchUpNext(paginationToken?: string): OPackMessage {
    return request('FetchUpNextInfoEvent', paginationToken ? { PaginationTokenKey: paginationToken } : {});
}

/**
 * Builds a request to add a media item to the Up Next queue.
 *
 * @param identifier - The content identifier of the media item.
 * @param kind - The content kind (e.g. movie, episode).
 * @returns The add-to-Up-Next request message.
 */
export function addToUpNext(identifier: string, kind: string): OPackMessage {
    return request('AddToUpNextEvent', { IdentifierKey: identifier, KindKey: kind });
}

/**
 * Builds a request to remove a media item from the Up Next queue.
 *
 * @param identifier - The content identifier of the media item.
 * @param kind - The content kind (e.g. movie, episode).
 * @returns The remove-from-Up-Next request message.
 */
export function removeFromUpNext(identifier: string, kind: string): OPackMessage {
    return request('RemoveFromUpNextEvent', { IdentifierKey: identifier, KindKey: kind });
}

/**
 * Builds a request to mark a media item as watched.
 *
 * @param identifier - The content identifier of the media item.
 * @param kind - The content kind (e.g. movie, episode).
 * @returns The mark-as-watched request message.
 */
export function markAsWatched(identifier: string, kind: string): OPackMessage {
    return request('MarkAsWatchedEvent', { IdentifierKey: identifier, KindKey: kind });
}

/**
 * Builds a request to play a specific media item on the Apple TV.
 *
 * @param item - The media item descriptor with playback parameters.
 * @returns The play media request message.
 */
export function playMedia(item: Record<string, unknown>): OPackMessage {
    return request('PlayMediaEvent', item);
}

// --- Siri ---

/**
 * Builds a request to activate Siri (push-to-talk begin).
 *
 * @returns The Siri start request message.
 */
export function siriStart(): OPackMessage {
    return request('_siriStart');
}

/**
 * Builds a request to deactivate Siri (push-to-talk end).
 *
 * @returns The Siri stop request message.
 */
export function siriStop(): OPackMessage {
    return request('_siriStop');
}

// --- Presence ---

/**
 * Builds a request to publish the controller's presence to the Apple TV.
 * Used to signal that this controller is actively connected and available.
 *
 * @returns The publish presence request message.
 */
export function publishPresence(): OPackMessage {
    return request('PublishPresenceEvent');
}

// --- Game Controller ---

/**
 * Builds a game controller event message with analog stick position.
 * Sent as a fire-and-forget event (no response expected).
 *
 * @param x - X coordinate of the analog stick (-1.0 to 1.0).
 * @param y - Y coordinate of the analog stick (-1.0 to 1.0).
 * @param isDown - Whether the button is pressed.
 * @returns The game controller event message.
 */
export function gameControllerEvent(x: number, y: number, isDown: boolean): OPackMessage {
    return event('_gcC', {_gcX: x, _gcY: y, _gcBtS: isDown ? 1 : 0});
}

/**
 * Builds a game controller session start message.
 *
 * @returns The game controller start request message.
 */
export function gameControllerStart(): OPackMessage {
    return requestBtHP('_gcStart');
}

/**
 * Builds a game controller session stop message.
 *
 * @returns The game controller stop request message.
 */
export function gameControllerStop(): OPackMessage {
    return requestBtHP('_gcStop');
}

// --- App Sign-In ---

/**
 * Builds a request to proxy an app sign-in flow through the companion device.
 * Used when an Apple TV app requests authentication via a paired iPhone/iPad.
 *
 * @param bundleId - The bundle identifier of the app requesting sign-in.
 * @param requestType - The type of sign-in request ('appleID', 'password', or 'custom').
 * @returns The app sign-in request message.
 */
export function appSignInRequest(bundleId: string, requestType: string = 'appleID'): OPackMessage {
    return request('_cpsAISR', {_bundleID: bundleId, _reqType: requestType});
}

// --- TV Provider ---

/**
 * Builds a TV provider authentication request.
 * Used for MVPD (Multichannel Video Programming Distributor) sign-in on Apple TV.
 *
 * @param providerUrl - The provider's authentication URL.
 * @param providerName - The provider's display name.
 * @returns The TV provider request message.
 */
export function tvProviderRequest(providerUrl: string, providerName: string): OPackMessage {
    return request('_cpsTVPR', {_pvUrl: providerUrl, _pvName: providerName});
}

// --- Restricted Access ---

/**
 * Builds a restricted access (parental controls) approval request.
 *
 * @param restrictionType - The type of restriction being requested.
 * @returns The restricted access request message.
 */
export function restrictedAccessRequest(restrictionType: string): OPackMessage {
    return request('_cpsRAR', {_raType: restrictionType});
}
