import { randomInt } from 'node:crypto';
import { debug, opackFloat, parseBinaryPlist, waitFor } from '@basmilius/apple-common';
import { type default as CompanionLinkSocket, FrameType, MessageType } from './socket';
import type CompanionLink from './protocol';

export default class CompanionLinkApi {
    get socket(): CompanionLinkSocket {
        return this.#protocol.socket;
    }

    readonly #protocol: CompanionLink;

    constructor(protocol: CompanionLink) {
        this.#protocol = protocol;
    }

    async fetchMediaControlStatus(): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchMediaControlStatus',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchNowPlayingInfo(): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchCurrentNowPlayingInfoEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async fetchSupportedActions(): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchSupportedActionsEvent',
            _t: MessageType.Request,
            _c: {}
        });
    }

    async getAttentionState(): Promise<AttentionState> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchAttentionState',
            _t: MessageType.Request,
            _c: {}
        });

        const {_c} = objectOrFail<AttentionStateResponse>(payload);

        switch (_c.state) {
            case 0x01:
                return 'asleep';

            case 0x02:
                return 'screensaver';

            case 0x03:
                return 'awake';

            case 0x04:
                return 'idle';

            default:
                return 'unknown';
        }
    }

    async getLaunchableApps(): Promise<LaunchableApp[]> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
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
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'FetchSiriRemoteInfo',
            _t: MessageType.Request,
            _c: {}
        });

        return parseBinaryPlist(Buffer.from(payload['_c']['SiriRemoteInfoKey']).buffer);
    }

    async getUserAccounts(): Promise<UserAccount[]> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
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

    async hidCommand(command: keyof typeof HidCommand, down = false): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: '_hidC',
            _t: MessageType.Request,
            _c: {
                _hBtS: down ? 1 : 2,
                _hidC: HidCommand[command]
            }
        });
    }

    async launchApp(bundleId: string): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _bundleID: bundleId
            }
        });
    }

    async launchUrl(url: string): Promise<void> {
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: '_launchApp',
            _t: MessageType.Request,
            _c: {
                _urlS: url
            }
        });
    }

    async mediaControlCommand(command: keyof typeof MediaControlCommand, content?: object): Promise<object> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
            _i: '_mcc',
            _t: MessageType.Request,
            _c: {
                _mcc: MediaControlCommand[command],
                ...(content || {})
            }
        });

        return objectOrFail(payload);
    }

    async pressButton(command: keyof typeof HidCommand, type: ButtonPressType = 'SingleTap', holdDelayMs = 500): Promise<void> {
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
        await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'SwitchUserAccountEvent',
            _t: MessageType.Request,
            _c: {
                SwitchAccountID: accountId
            }
        });
    }

    async _subscribe(event: string, fn: EventListener): Promise<void> {
        this.socket.addEventListener(event, fn);

        await this.socket.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _regEvents: [event]
            }
        });
    }

    async _unsubscribe(event: string, fn?: EventListener): Promise<void> {
        if (fn) {
            this.socket.removeEventListener(event, fn);
        }

        await this.socket.send(FrameType.E_OPACK, {
            _i: '_interest',
            _t: MessageType.Event,
            _c: {
                _deregEvents: [event]
            }
        });
    }

    async _sessionStart(): Promise<object> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
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
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
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
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
            _i: '_touchStart',
            _t: MessageType.Request,
            _c: {
                _height: opackFloat(1000.0),
                _tFl: 0,
                _width: opackFloat(1000.0)
            }
        });

        return objectOrFail(payload);
    }

    async _tvrcSessionStart(): Promise<object> {
        const [, payload] = await this.socket.exchange(FrameType.E_OPACK, {
            _i: 'TVRCSessionStart',
            _t: MessageType.Request,
            _btHP: false,
            _inUseProc: 'tvremoted',
            _c: {}
        });

        return objectOrFail(payload);
    }
}

const HidCommand = {
    Up: 1,
    Down: 2,
    Left: 3,
    Right: 4,
    Menu: 5,
    Select: 6,
    Home: 7,
    VolumeUp: 8,
    VolumeDown: 9,
    Siri: 10,
    Screensaver: 11,
    Sleep: 12,
    Wake: 13,
    PlayPause: 14,
    ChannelIncrement: 15,
    ChannelDecrement: 16,
    Guide: 17,
    PageUp: 18,
    PageDown: 19
} as const;

const MediaControlCommand = {
    Play: 1,
    Pause: 2,
    NextTrack: 3,
    PreviousTrack: 4,
    GetVolume: 5,
    SetVolume: 6,
    SkipBy: 7,
    FastForwardBegin: 8,
    FastForwardEnd: 9,
    RewindBegin: 10,
    RewindEnd: 11,
    GetCaptionSettings: 12,
    SetCaptionSettings: 13
} as const;

type ButtonPressType =
    | 'DoubleTap'
    | 'Hold'
    | 'SingleTap';

function objectOrFail<T = object>(obj: unknown): T {
    if (typeof obj === 'object') {
        return obj as T;
    }

    debug('Expected an object.', {obj});

    throw new Error('Expected an object.');
}

type AttentionState =
    | 'unknown'
    | 'asleep'
    | 'screensaver'
    | 'awake'
    | 'idle';

type AttentionStateResponse = {
    readonly _c: {
        readonly state: number;
    };
};

type LaunchableApp = {
    readonly bundleId: string;
    readonly name: string;
};

type LaunchableAppsResponse = {
    readonly _c: Record<string, string>;
};

type UserAccount = {
    readonly accountId: string;
    readonly name: string;
};

type UserAccountsResponse = {
    readonly _c: Record<string, string>;
};
