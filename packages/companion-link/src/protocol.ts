import { randomInt } from 'node:crypto';
import { type DiscoveryResult, reporter, waitFor } from '@basmilius/apple-common';
import { OPack, Plist } from '@basmilius/apple-encoding';
import { FrameType, MessageType } from './messages';
import type { AttentionState, ButtonPressType, LaunchableApp, UserAccount } from './types';
import { convertAttentionState } from './utils';
import { HidCommand, type HidCommandKey, MediaControlCommand, type MediaControlCommandKey } from './const';
import Pairing from './pairing';
import Socket from './socket';
import Verify from './verify';

export default class CompanionLink {
    get device(): DiscoveryResult {
        return this.#device;
    }

    get socket(): Socket {
        return this.#socket;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #device: DiscoveryResult;
    readonly #socket: Socket;
    readonly #pairing: Pairing;
    readonly #verify: Verify;

    constructor(device: DiscoveryResult) {
        this.#device = device;
        this.#socket = new Socket(device.address, device.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#socket.connect();
    }

    async disconnect(): Promise<void> {
        await this.#socket.disconnect();
    }

    async fetchMediaControlStatus(): Promise<void> {
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchMediaControlStatus',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchNowPlayingInfo(): Promise<void> {
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchCurrentNowPlayingInfoEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchSupportedActions(): Promise<void> {
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchSupportedActionsEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchAttentionState',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<AttentionStateResponse>(payload);

        return convertAttentionState(_c.state);
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
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
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchSiriRemoteInfo',
            _t: MessageType.Request,
            _c: {}
        });

        return Plist.parse(Buffer.from(payload['_c']['SiriRemoteInfoKey']).buffer);
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
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
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_hidC',
            _t: MessageType.Request,
            _c: {
                _hBtS: down ? 1 : 2,
                _hidC: HidCommand[command]
            }
        });
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _bundleID: bundleId
            }
        });
    }

    async launchUrl(url: string): Promise<void> {
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _urlS: url
            }
        });
    }

    async mediaControlCommand(command: MediaControlCommandKey, content?: object): Promise<object> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
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
        await this.#socket.exchange(FrameType.E_OPACK, {
            _i: 'SwitchUserAccountEvent',
            _t: MessageType.Request,
            _c: {
                SwitchAccountID: accountId
            }
        });
    }

    async _subscribe(event: string, fn: (data: unknown) => void): Promise<void> {
        this.#socket.on(event, fn);

        await this.#socket.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _regEvents: [event]
            }
        });
    }

    async _unsubscribe(event: string, fn?: (data: unknown) => void): Promise<void> {
        if (!this.socket.isConnected) {
            return;
        }

        if (fn) {
            this.#socket.off(event, fn);
        }

        await this.#socket.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _deregEvents: [event]
            }
        });
    }

    async _sessionStart(): Promise<object> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_sessionStart',
            _t: MessageType.Request,
            _c: {
                _srvT: 'com.apple.tvremoteservices',
                _sid: randomInt(0, 2 ** 32 - 1)
            }
        });

        return objectOrFail(payload);
    }

    async _systemInfo(pairingId: Buffer): Promise<object> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_systemInfo',
            _t: MessageType.Request,
            _c: {
                _bf: 0,
                _cf: 512,
                _clFl: 128,
                _i: 'cafecafecafe',
                _idsID: pairingId.toString(),
                _pubID: 'FF:70:79:61:74:76',
                _sf: 256,
                _sv: '170.18',
                model: 'iPhone10,6',
                name: 'Bas Companion Link'
            }
        });

        return objectOrFail(payload);
    }

    async _touchStart(): Promise<object> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
            _i: '_touchStart',
            _t: MessageType.Request,
            _c: {
                _height: OPack.float(1000.0),
                _tFl: 0,
                _width: OPack.float(1000.0)
            }
        });

        return objectOrFail(payload);
    }

    async _tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.#socket.exchange(FrameType.E_OPACK, {
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

    reporter.error('Expected an object.', {obj});

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
