import { randomInt } from 'node:crypto';
import { Context, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { OPack, Plist } from '@basmilius/apple-encoding';
import { HidCommand, type HidCommandKey, MediaControlCommand, type MediaControlCommandKey } from './const';
import { FrameType, MessageType } from './frame';
import { Pairing, Verify } from './pairing';
import type { AttentionState, ButtonPressType, LaunchableApp, UserAccount } from './types';
import { convertAttentionState } from './utils';
import Stream from './stream';

const UID = (n: number) => ({'CF$UID': n});

function buildRtiClearPayload(sessionUUID: Buffer): ArrayBuffer {
    return Plist.serialize({
        '$version': 100000,
        '$archiver': 'RTIKeyedArchiver',
        '$top': {textOperations: UID(1)},
        '$objects': [
            '$null',
            {'$class': UID(7), targetSessionUUID: UID(5), keyboardOutput: UID(2), textToAssert: UID(4)},
            {'$class': UID(3)},
            {'$classname': 'TIKeyboardOutput', '$classes': ['TIKeyboardOutput', 'NSObject']},
            '',
            {'NS.uuidbytes': sessionUUID.buffer.slice(sessionUUID.byteOffset, sessionUUID.byteOffset + sessionUUID.byteLength) as ArrayBuffer, '$class': UID(6)},
            {'$classname': 'NSUUID', '$classes': ['NSUUID', 'NSObject']},
            {'$classname': 'RTITextOperations', '$classes': ['RTITextOperations', 'NSObject']}
        ]
    } as any) as ArrayBuffer;
}

function buildRtiInputPayload(sessionUUID: Buffer, text: string): ArrayBuffer {
    return Plist.serialize({
        '$version': 100000,
        '$archiver': 'RTIKeyedArchiver',
        '$top': {textOperations: UID(1)},
        '$objects': [
            '$null',
            {keyboardOutput: UID(2), '$class': UID(7), targetSessionUUID: UID(5)},
            {insertionText: UID(3), '$class': UID(4)},
            text,
            {'$classname': 'TIKeyboardOutput', '$classes': ['TIKeyboardOutput', 'NSObject']},
            {'NS.uuidbytes': sessionUUID.buffer.slice(sessionUUID.byteOffset, sessionUUID.byteOffset + sessionUUID.byteLength) as ArrayBuffer, '$class': UID(6)},
            {'$classname': 'NSUUID', '$classes': ['NSUUID', 'NSObject']},
            {'$classname': 'RTITextOperations', '$classes': ['RTITextOperations', 'NSObject']}
        ]
    } as any) as ArrayBuffer;
}

export default class Protocol {
    get context(): Context {
        return this.#context;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get stream(): Stream {
        return this.#stream;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #context: Context;
    readonly #discoveryResult: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #stream: Stream;
    readonly #verify: Verify;
    #sessionId: bigint = 0n;

    constructor(discoveryResult: DiscoveryResult) {
        this.#context = new Context(discoveryResult.id);
        this.#discoveryResult = discoveryResult;
        this.#stream = new Stream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#stream.connect();
    }

    destroy(): void {
        this.#stream.destroy();
    }

    async disconnect(): Promise<void> {
        try {
            await this.gracefulStop();
        } catch (err) {
            this.#context.logger.warn('[companion-link]', 'Graceful stop failed during disconnect', err);
        }

        await this.#stream.disconnect();
    }

    async gracefulStop(): Promise<void> {
        if (!this.#stream.isConnected) {
            return;
        }

        this.deregisterInterests(['_iMC', 'SystemStatus', 'TVSystemStatus']);

        try { await this.tiStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'tiStop failed', err);
        }
        try { await this.touchStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'touchStop failed', err);
        }
        try { await this.sessionStop(); } catch (err) {
            this.#context.logger.warn('[companion-link]', 'sessionStop failed', err);
        }
    }

    async fetchMediaControlStatus(): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchMediaControlStatus',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchNowPlayingInfo(): Promise<any> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchCurrentNowPlayingInfoEvent',
            _t: MessageType.Request,
            _c: {}
        });

        return payload;
    }

    async fetchSupportedActions(): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchSupportedActionsEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchAttentionState',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<AttentionStateResponse>(payload);

        return convertAttentionState(_c.state);
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchLaunchableApplicationsEvent',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<LaunchableAppsResponse>(payload);

        return Object.entries(_c).map(([bundleId, name]) => ({
            bundleId,
            name
        }));
    }

    async getSiriRemoteInfo(): Promise<any> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchSiriRemoteInfo',
            _t: MessageType.Request,
            _c: {}
        });

        return Plist.parse(Buffer.from(payload['_c']['SiriRemoteInfoKey']).buffer);
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'FetchUserAccountsEvent',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<UserAccountsResponse>(payload);

        return Object.entries(_c).map(([accountId, name]) => ({
            accountId,
            name
        }));
    }

    async hidCommand(command: HidCommandKey, down = false): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_hidC',
            _t: MessageType.Request,
            _c: {
                _hBtS: down ? 1 : 2,
                _hidC: HidCommand[command]
            }
        });
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _bundleID: bundleId
            }
        });
    }

    async launchUrl(url: string): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _urlS: url
            }
        });
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: object): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_mcc',
            _t: MessageType.Request,
            _c: {
                _mcc: MediaControlCommand[command],
                ...(content || {})
            }
        });

        return objectOrFail(payload);
    }

    async pressButton(command: HidCommandKey, type: ButtonPressType = 'SingleTap', holdDelayMs = 500): Promise<void> {
        switch (type) {
            case 'DoubleTap':
                await this.hidCommand(command, true);
                await this.hidCommand(command, false);

                await this.hidCommand(command, true);
                await this.hidCommand(command, false);
                break;

            case 'Hold':
                await this.hidCommand(command, true);
                await waitFor(holdDelayMs);
                await this.hidCommand(command, false);
                break;

            case 'SingleTap':
                await this.hidCommand(command, true);
                await this.hidCommand(command, false);
                break;
        }
    }

    async switchUserAccount(accountId: string): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'SwitchUserAccountEvent',
            _t: MessageType.Request,
            _c: {
                SwitchAccountID: accountId
            }
        });
    }

    async subscribe(event: string, fn: (data: unknown) => void): Promise<void> {
        this.#stream.on(event, fn);

        this.#stream.sendOPack(FrameType.OPackEncrypted, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _regEvents: [event]
            }
        });
    }

    async unsubscribe(event: string, fn?: (data: unknown) => void): Promise<void> {
        if (!this.#stream.isConnected) {
            return;
        }

        if (fn) {
            this.#stream.off(event, fn);
        }

        this.#stream.sendOPack(FrameType.OPackEncrypted, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _deregEvents: [event]
            }
        });
    }

    registerInterests(events: string[]): void {
        this.#stream.sendOPack(FrameType.OPackEncrypted, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _regEvents: events
            }
        });
    }

    deregisterInterests(events: string[]): void {
        if (!this.#stream.isConnected) {
            return;
        }

        this.#stream.sendOPack(FrameType.OPackEncrypted, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _deregEvents: events
            }
        });
    }

    async sessionStart(): Promise<object> {
        const localSid = randomInt(0, 2 ** 32 - 1);

        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_sessionStart',
            _t: MessageType.Request,
            _btHP: false,
            _c: {
                _srvT: 'com.apple.tvremoteservices',
                _sid: localSid,
                _btHP: false
            }
        });

        const result = objectOrFail<any>(payload);
        const remoteSid = Number(result?._c?._sid ?? 0);
        this.#sessionId = (BigInt(remoteSid) << 32n) | BigInt(localSid);

        return result;
    }

    async sessionStop(): Promise<void> {
        if (this.#sessionId === 0n) {
            return;
        }

        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_sessionStop',
            _t: MessageType.Request,
            _c: {
                _srvT: 'com.apple.tvremoteservices',
                _sid: Number(this.#sessionId)
            }
        });

        this.#sessionId = 0n;
    }

    async systemInfo(pairingId: Buffer): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_systemInfo',
            _t: MessageType.Request,
            _btHP: false,
            _c: {
                _bf: 0,
                _cf: 512,
                _clFl: 128,
                _i: 'b561af32aea6',
                _idsID: pairingId.toString(),
                _pubID: 'DA:6D:1E:D8:A0:4F',
                _sf: 1099511628032,
                _sv: '715.2',
                model: 'iPhone16,2',
                name: 'AP Companion Link',
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
            }
        });

        return objectOrFail(payload);
    }

    async tiStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_tiStart',
            _t: MessageType.Request,
            _btHP: false,
            _c: {}
        });

        return objectOrFail(payload);
    }

    async textInputCommand(text: string, clearPreviousInput: boolean): Promise<string | null> {
        // Restart the text input session to get fresh sessionUUID (like pyatv).
        await this.tiStop();
        const response = await this.tiStart();

        const tiD = (response as any)?._c?._tiD;
        if (!tiD) {
            return null;
        }

        // Parse sessionUUID from NSKeyedArchiver binary plist.
        const archive = Plist.parse(Buffer.from(tiD).buffer as ArrayBuffer) as any;
        const objects = archive?.['$objects'];
        const top = archive?.['$top'];
        if (!objects || !top) {
            return null;
        }

        // The $top contains sessionUUID as a UID reference into $objects.
        const ref = top.sessionUUID;
        const refIndex = typeof ref === 'object' && ref !== null ? ref['CF$UID'] : ref;
        const sessionUUID = objects[refIndex];

        if (!sessionUUID) {
            return null;
        }

        const sessionBytes = Buffer.from(
            sessionUUID instanceof ArrayBuffer ? sessionUUID
                : sessionUUID instanceof Uint8Array ? sessionUUID
                : sessionUUID.buffer ?? sessionUUID
        );

        if (clearPreviousInput) {
            this.#sendTextEvent(buildRtiClearPayload(sessionBytes));
        }

        if (text) {
            this.#sendTextEvent(buildRtiInputPayload(sessionBytes, text));
        }

        return text;
    }

    async tiStop(): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_tiStop',
            _t: MessageType.Request,
            _btHP: false,
            _c: {}
        });
    }

    #sendTextEvent(tiD: ArrayBuffer): void {
        this.#stream.sendOPack(FrameType.OPackEncrypted, {
            _i: '_tiC',
            _t: MessageType.Event,
            _c: {
                _tiV: 1,
                _tiD: Buffer.from(tiD)
            }
        });
    }

    async touchStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_touchStart',
            _t: MessageType.Request,
            _btHP: false,
            _c: {
                _height: OPack.float(1000.0),
                _tFl: 0,
                _width: OPack.float(1000.0)
            }
        });

        return objectOrFail(payload);
    }

    async touchStop(): Promise<void> {
        await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: '_touchStop',
            _t: MessageType.Request,
            _c: {
                _i: 1
            }
        });
    }

    async tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.OPackEncrypted, {
            _i: 'TVRCSessionStart',
            _t: MessageType.Request,
            _btHP: false,
            _inUseProc: 'tvremoted',
            _c: {}
        });

        return objectOrFail(payload);
    }

    noOp(): void {
        this.#context.logger.debug('Sending no-op operation.');

        this.#stream.send(FrameType.NoOp, Buffer.allocUnsafe(0));
    }
}

function objectOrFail<T = object>(obj: unknown): T {
    if (obj !== null && typeof obj === 'object') {
        return obj as T;
    }

    throw new TypeError('Expected an object.');
}

type AttentionStateResponse = {
    readonly _c: {
        readonly state: number;
    };
};

type LaunchableAppsResponse = {
    readonly _c: Record<string, string>;
};

type UserAccountsResponse = {
    readonly _c: Record<string, string>;
};
