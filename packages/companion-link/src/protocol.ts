import { randomInt } from 'node:crypto';
import { COMPANION_LINK_SERVICE, Context, type DiscoveryResult, waitFor } from '@basmilius/apple-common';
import { OPack, Plist } from '@basmilius/apple-encoding';
import { HidCommand, type HidCommandKey, MediaControlCommand, type MediaControlCommandKey } from './const';
import { FrameType, MessageType } from './frame';
import { Pairing, Verify } from './pairing';
import type { AttentionState, ButtonPressType, LaunchableApp, UserAccount } from './types';
import { convertAttentionState } from './utils';
import Stream from './stream';

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

    constructor(deviceId: string, discoveryResult: DiscoveryResult) {
        this.#context = new Context(deviceId.replace(`.${COMPANION_LINK_SERVICE}`, '').replace('.local', ''));
        this.#discoveryResult = discoveryResult;
        this.#stream = new Stream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#stream.connect();
    }

    async destroy(): Promise<void> {
        await this.#stream.destroy();
    }

    async disconnect(): Promise<void> {
        await this.#stream.disconnect();
    }

    async fetchMediaControlStatus(): Promise<void> {
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'FetchMediaControlStatus',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchNowPlayingInfo(): Promise<void> {
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'FetchCurrentNowPlayingInfoEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchSupportedActions(): Promise<void> {
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'FetchSupportedActionsEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'FetchAttentionState',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<AttentionStateResponse>(payload);

        return convertAttentionState(_c.state);
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
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
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'FetchSiriRemoteInfo',
            _t: MessageType.Request,
            _c: {}
        });

        return Plist.parse(Buffer.from(payload['_c']['SiriRemoteInfoKey']).buffer);
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
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
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: '_hidC',
            _t: MessageType.Request,
            _c: {
                _hBtS: down ? 1 : 2,
                _hidC: HidCommand[command]
            }
        });
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _bundleID: bundleId
            }
        });
    }

    async launchUrl(url: string): Promise<void> {
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _urlS: url
            }
        });
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: object): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
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
        await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'SwitchUserAccountEvent',
            _t: MessageType.Request,
            _c: {
                SwitchAccountID: accountId
            }
        });
    }

    async _subscribe(event: string, fn: (data: unknown) => void): Promise<void> {
        this.#stream.on(event, fn);

        await this.#stream.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _regEvents: [event]
            }
        });
    }

    async _unsubscribe(event: string, fn?: (data: unknown) => void): Promise<void> {
        if (!this.#stream.isConnected) {
            return;
        }

        if (fn) {
            this.#stream.off(event, fn);
        }

        await this.#stream.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _deregEvents: [event]
            }
        });
    }

    async _sessionStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
            _i: '_sessionStart',
            _t: MessageType.Request,
            _btHP: false,
            _c: {
                _srvT: 'com.apple.tvremoteservices',
                _sid: randomInt(0, 2 ** 32 - 1),
                _btHP: false
            }
        });

        return objectOrFail(payload);
    }

    async _systemInfo(pairingId: Buffer): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
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

    async _tiStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
            _i: '_tiStart',
            _t: MessageType.Request,
            _btHP: false,
            _c: {}
        });

        return objectOrFail(payload);
    }

    async _touchStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
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

    async _tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.#stream.exchange(FrameType.E_OPACK, {
            _i: 'TVRCSessionStart',
            _t: MessageType.Request,
            _btHP: false,
            _inUseProc: 'tvremoted',
            _c: {}
        });

        return objectOrFail(payload);
    }
}

function objectOrFail<T = object>(obj: unknown): T {
    if (typeof obj === 'object') {
        return obj as T;
    }

    throw new Error('Expected an object.');
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
