import { Discovery, type AccessoryCredentials, type DiscoveryResult, type Storage } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import * as AirPlay from '@basmilius/apple-airplay';
import { Proto } from '@basmilius/apple-airplay';
import * as CompanionLink from '@basmilius/apple-companion-link';
import { COMPANION_LINK, AppleTV, HomePod } from '@basmilius/apple-devices';
import type { AirPlayState } from '@basmilius/apple-devices';
import getSavedCredentials from '../getSavedCredentials';
import { PlaybackStateLabel } from '../util';

export type DeviceInfo = {
    id: string;
    name: string;
    model: string;
    address: string;
    type: 'appletv' | 'homepod' | 'homepod-mini' | 'other';
    protocols: ('airplay' | 'companionLink')[];
    paired: ('airplay' | 'companionLink')[];
};

export type StateSnapshot = {
    connected: boolean;
    device: DeviceInfo | null;
    airplay: {
        connected: boolean;
    };
    companionLink: {
        connected: boolean;
    } | null;
    nowPlaying: {
        title: string;
        artist: string;
        album: string;
        duration: number;
        elapsedTime: number;
        playbackState: string;
        artworkUrl: string | null;
        app: string | null;
        bundleIdentifier: string | null;
    };
    volume: {
        level: number;
        available: boolean;
        muted: boolean;
    };
    clients: ClientSnapshot[];
};

type ClientSnapshot = {
    bundleIdentifier: string;
    displayName: string;
    isActive: boolean;
    playbackState: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    mediaType: string;
    contentIdentifier: string;
    shuffleMode: string;
    repeatMode: string;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    players: PlayerSnapshot[];
};

type PlayerSnapshot = {
    identifier: string;
    displayName: string;
    isActive: boolean;
    isDefaultPlayer: boolean;
    playbackState: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    seriesName: string;
    seasonNumber: number;
    episodeNumber: number;
    mediaType: string;
    contentIdentifier: string;
    shuffleMode: string;
    repeatMode: string;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    supportedCommands: string[];
};

type DeviceManagerListener = (event: string, data: unknown) => void;

export default class DeviceManager {

    readonly #storage: Storage;
    readonly #listeners = new Set<DeviceManagerListener>();

    #device: AppleTV | HomePod | null = null;
    #deviceInfo: DeviceInfo | null = null;
    #airplayDevices: DiscoveryResult[] = [];
    #companionDevices: DiscoveryResult[] = [];
    #pairingResolve: ((pin: string) => void) | null = null;
    #pairingProtocol: AirPlay.Protocol | CompanionLink.Protocol | null = null;

    constructor(storage: Storage) {
        this.#storage = storage;
    }

    get isConnected(): boolean {
        return this.#device !== null;
    }

    async discover(): Promise<DeviceInfo[]> {
        const [airplayDevices, companionDevices] = await Promise.all([
            Discovery.airplay().find(false),
            Discovery.companionLink().find(false)
        ]);

        this.#airplayDevices = airplayDevices;
        this.#companionDevices = companionDevices;

        const devices: DeviceInfo[] = [];

        for (const device of airplayDevices) {
            const model = device.txt.model ?? '';

            let type: DeviceInfo['type'];
            if (model.startsWith('AppleTV')) {
                type = 'appletv';
            } else if (/^AudioAccessory5,/.test(model)) {
                type = 'homepod-mini';
            } else if (/^AudioAccessory[16],/.test(model)) {
                type = 'homepod';
            } else {
                type = 'other';
            }

            const hasCompanionLink = companionDevices.some(d =>
                d.id === device.id ||
                d.address === device.address ||
                d.fqdn === device.fqdn
            );

            const protocols: ('airplay' | 'companionLink')[] = ['airplay'];
            if (hasCompanionLink) {
                protocols.push('companionLink');
            }

            const paired: ('airplay' | 'companionLink')[] = [];
            if (this.#storage.getCredentials(device.id, 'airplay')) {
                paired.push('airplay');
            }
            if (hasCompanionLink) {
                const clDevice = companionDevices.find(d =>
                    d.id === device.id ||
                    d.address === device.address ||
                    d.fqdn === device.fqdn
                )!;
                if (this.#storage.getCredentials(clDevice.id, 'companionLink') || this.#storage.getCredentials(device.id, 'companionLink')) {
                    paired.push('companionLink');
                }
            }

            devices.push({
                id: device.id,
                name: device.fqdn,
                model: model || 'Unknown',
                address: device.address,
                type,
                protocols,
                paired
            });
        }

        return devices;
    }

    async connect(deviceId: string): Promise<void> {
        if (this.#device) {
            await this.disconnect();
        }

        const airplayResult = this.#airplayDevices.find(d => d.id === deviceId);

        if (!airplayResult) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        const isAppleTV = airplayResult.txt.model?.startsWith('AppleTV') ?? false;

        if (isAppleTV) {
            await this.#connectAppleTV(airplayResult);
        } else {
            await this.#connectHomePod(airplayResult);
        }
    }

    async connectByIp(address: string, port = 7000): Promise<void> {
        if (this.#device) {
            await this.disconnect();
        }

        const syntheticResult: DiscoveryResult = {
            id: address,
            fqdn: address,
            address,
            modelName: 'Unknown',
            familyName: null,
            txt: {},
            service: {port, protocol: 'tcp', type: '_airplay._tcp.local'},
            packet: {} as any
        };

        const airplayCredentials = this.#storage.getCredentials(address, 'airplay');

        if (airplayCredentials) {
            await this.#connectHomePod(syntheticResult);
        } else {
            await this.#connectHomePod(syntheticResult);
        }
    }

    async disconnect(): Promise<void> {
        if (!this.#device) {
            return;
        }

        try {
            await this.#device.disconnect();
        } catch {}

        this.#device = null;
        this.#deviceInfo = null;
        this.#emit('disconnected', null);
    }

    async executeCommand(cmd: string, arg?: string): Promise<unknown> {
        const device = this.#device;

        if (!device) {
            throw new Error('No device connected');
        }

        switch (cmd) {
            case 'play': await device.play(); break;
            case 'pause': await device.pause(); break;
            case 'playpause': await device.playPause(); break;
            case 'stop': await device.stop(); break;
            case 'next': await device.next(); break;
            case 'previous': await device.previous(); break;
            case 'volup':
                if (device instanceof AppleTV) {
                    await device.volumeUp();
                } else {
                    await device.remote.volumeUp();
                }
                break;
            case 'voldown':
                if (device instanceof AppleTV) {
                    await device.volumeDown();
                } else {
                    await device.remote.volumeDown();
                }
                break;
            case 'mute':
                if (device instanceof AppleTV) {
                    await device.volumeMute();
                } else {
                    await device.remote.mute();
                }
                break;
            case 'vol':
                if (arg) {
                    const pct = parseInt(arg) / 100;
                    await device.volumeControl.set(pct);
                }
                return {volume: Math.round(device.volume * 100)};

            // Streaming (both device types)
            case 'stream':
                if (arg) {
                    const audioSource = await Url.fromUrl(arg);
                    if (device instanceof AppleTV) {
                        await device.airplay.streamAudio(audioSource);
                    } else {
                        await device.streamAudio(audioSource);
                    }
                }
                break;
            case 'playurl':
                if (arg) {
                    if (device instanceof AppleTV) {
                        await device.airplay.playUrl(arg);
                    } else {
                        await device.playUrl(arg);
                    }
                }
                break;

            // Apple TV only commands
            case 'up': await this.#requireAppleTV().remote.up(); break;
            case 'down': await this.#requireAppleTV().remote.down(); break;
            case 'left': await this.#requireAppleTV().remote.left(); break;
            case 'right': await this.#requireAppleTV().remote.right(); break;
            case 'select': await this.#requireAppleTV().remote.select(); break;
            case 'menu': await this.#requireAppleTV().remote.menu(); break;
            case 'home': await this.#requireAppleTV().remote.home(); break;
            case 'topmenu': await this.#requireAppleTV().remote.topMenu(); break;
            case 'chup': await this.#requireAppleTV().remote.channelUp(); break;
            case 'chdown': await this.#requireAppleTV().remote.channelDown(); break;
            case 'back': {
                const clProto = (this.#requireAppleTV().companionLink as any)[COMPANION_LINK];
                await clProto.stream.exchange(8, {_i: '_hidC', _t: 2, _c: {_hBtS: 1, _hidC: 21}});
                await clProto.stream.exchange(8, {_i: '_hidC', _t: 2, _c: {_hBtS: 2, _hidC: 21}});
                break;
            }
            case 'power': {
                const atv = this.#requireAppleTV();
                if (atv.isPlaying) {
                    await atv.turnOff();
                } else {
                    await atv.turnOn();
                }
                break;
            }
            case 'wake': await this.#requireAppleTV().turnOn(); break;
            case 'suspend': await this.#requireAppleTV().turnOff(); break;

            // Swipe & tap
            case 'swipeup': await this.#requireAppleTV().remote.swipeUp(); break;
            case 'swipedown': await this.#requireAppleTV().remote.swipeDown(); break;
            case 'swipeleft': await this.#requireAppleTV().remote.swipeLeft(); break;
            case 'swiperight': await this.#requireAppleTV().remote.swipeRight(); break;
            case 'tap': await this.#requireAppleTV().remote.tap(200, 200); break;
            case 'clswipeup': await this.#requireAppleTV().companionLink.swipe('up'); break;
            case 'clswipedown': await this.#requireAppleTV().companionLink.swipe('down'); break;
            case 'clswipeleft': await this.#requireAppleTV().companionLink.swipe('left'); break;
            case 'clswiperight': await this.#requireAppleTV().companionLink.swipe('right'); break;
            case 'cltap': await this.#requireAppleTV().companionLink.tap(); break;

            // Text input
            case 'type':
                if (arg) {
                    await this.#requireAppleTV().textSet(arg);
                }
                break;
            case 'append':
                if (arg) {
                    await this.#requireAppleTV().textAppend(arg);
                }
                break;
            case 'textclear': await this.#requireAppleTV().textClear(); break;

            // Skip
            case 'skipforward': {
                const seconds = parseInt(arg || '15');
                await this.#requireAppleTV().companionLink.mediaControlCommand('SkipBy', {_skpS: seconds});
                break;
            }
            case 'skipbackward': {
                const seconds = parseInt(arg || '15');
                await this.#requireAppleTV().companionLink.mediaControlCommand('SkipBy', {_skpS: -seconds});
                break;
            }

            // Companion Link features
            case 'captions': await this.#requireAppleTV().companionLink.toggleCaptions(); break;
            case 'darkmode': await this.#requireAppleTV().companionLink.toggleSystemAppearance(false); break;
            case 'lightmode': await this.#requireAppleTV().companionLink.toggleSystemAppearance(true); break;
            case 'siristart': await this.#requireAppleTV().companionLink.siriStart(); break;
            case 'siristop': await this.#requireAppleTV().companionLink.siriStop(); break;
            case 'findremote': await this.#requireAppleTV().companionLink.toggleFindingMode(true); break;

            // Info & debug
            case 'apps': {
                const apps = await this.#requireAppleTV().getLaunchableApps();
                return apps;
            }
            case 'launch':
                if (arg) {
                    await this.#requireAppleTV().launchApp(arg);
                }
                break;
            case 'users': {
                const users = await this.#requireAppleTV().getUserAccounts();
                return users;
            }
            case 'clnpi': {
                const npi = await this.#requireAppleTV().companionLink.fetchNowPlayingInfo();
                return npi;
            }
            case 'upnext': {
                const upNext = await this.#requireAppleTV().companionLink.fetchUpNext();
                return upNext;
            }
            case 'fetch':
                if (device instanceof AppleTV) {
                    await device.airplay.requestPlaybackQueue(1);
                }
                break;
            case 'hidtest':
                if (arg) {
                    const hidId = parseInt(arg);
                    const clp = (this.#requireAppleTV().companionLink as any)[COMPANION_LINK];
                    await clp.stream.exchange(8, {_i: '_hidC', _t: 2, _c: {_hBtS: 1, _hidC: hidId}});
                    await clp.stream.exchange(8, {_i: '_hidC', _t: 2, _c: {_hBtS: 2, _hidC: hidId}});
                }
                break;

            default:
                throw new Error(`Unknown command: ${cmd}`);
        }

        return {ok: true};
    }

    getState(): StateSnapshot {
        const device = this.#device;

        if (!device) {
            return {
                connected: false,
                device: null,
                airplay: {connected: false},
                companionLink: null,
                nowPlaying: {
                    title: '',
                    artist: '',
                    album: '',
                    duration: 0,
                    elapsedTime: 0,
                    playbackState: 'Unknown',
                    artworkUrl: null,
                    app: null,
                    bundleIdentifier: null
                },
                volume: {level: 0, available: false, muted: false},
                clients: []
            };
        }

        const state = device.state;
        const npc = state.nowPlayingClient;
        const activePlayer = npc?.activePlayer;
        const isAppleTV = device instanceof AppleTV;

        return {
            connected: true,
            device: this.#deviceInfo,
            airplay: {
                connected: isAppleTV ? device.airplay.isConnected : true
            },
            companionLink: isAppleTV ? {
                connected: (device as AppleTV).companionLink.isConnected
            } : null,
            nowPlaying: {
                title: device.title || '',
                artist: device.artist || '',
                album: device.album || '',
                duration: device.duration,
                elapsedTime: device.elapsedTime,
                playbackState: PlaybackStateLabel[device.playbackState] ?? 'Unknown',
                artworkUrl: activePlayer?.artworkUrl() ?? null,
                app: device.displayName ?? null,
                bundleIdentifier: device.bundleIdentifier ?? null
            },
            volume: {
                level: Math.round(device.volume * 100),
                available: state.volumeAvailable,
                muted: state.volumeMuted
            },
            clients: this.#buildClientSnapshots(state)
        };
    }

    addListener(listener: DeviceManagerListener): void {
        this.#listeners.add(listener);
    }

    removeListener(listener: DeviceManagerListener): void {
        this.#listeners.delete(listener);
    }

    #emit(event: string, data: unknown): void {
        for (const listener of this.#listeners) {
            listener(event, data);
        }
    }

    #requireAppleTV(): AppleTV {
        if (!(this.#device instanceof AppleTV)) {
            throw new Error('This command requires an Apple TV');
        }

        return this.#device;
    }

    #buildClientSnapshots(state: AirPlayState): ClientSnapshot[] {
        const clients = Object.values(state.clients);
        const nowPlayingClient = state.nowPlayingClient;

        const shuffleLabel = (mode: number) => ['Unknown', 'Off', 'Albums', 'Songs'][mode] ?? String(mode);
        const repeatLabel = (mode: number) => ['Unknown', 'Off', 'One', 'All'][mode] ?? String(mode);
        const mediaTypeLabel = (type: number) => ['Unknown', 'Audio', 'Video'][type] ?? String(type);
        const commandLabel = (cmd: number) => Proto.Command[cmd] ?? String(cmd);

        return clients.map(client => ({
            bundleIdentifier: client.bundleIdentifier,
            displayName: client.displayName,
            isActive: client.bundleIdentifier === nowPlayingClient?.bundleIdentifier,
            playbackState: PlaybackStateLabel[client.playbackState] ?? 'Unknown',
            title: client.title,
            artist: client.artist,
            album: client.album,
            genre: client.genre,
            mediaType: mediaTypeLabel(client.mediaType),
            contentIdentifier: client.contentIdentifier,
            shuffleMode: shuffleLabel(client.shuffleMode),
            repeatMode: repeatLabel(client.repeatMode),
            playbackRate: client.playbackRate,
            duration: client.duration,
            elapsedTime: client.elapsedTime,
            players: Array.from(client.players.values()).map(player => ({
                identifier: player.identifier,
                displayName: player.displayName,
                isActive: client.activePlayer?.identifier === player.identifier,
                isDefaultPlayer: player.isDefaultPlayer,
                playbackState: PlaybackStateLabel[player.playbackState] ?? 'Unknown',
                title: player.title,
                artist: player.artist,
                album: player.album,
                genre: player.genre,
                seriesName: player.seriesName,
                seasonNumber: player.seasonNumber,
                episodeNumber: player.episodeNumber,
                mediaType: mediaTypeLabel(player.mediaType),
                contentIdentifier: player.contentIdentifier,
                shuffleMode: shuffleLabel(player.shuffleMode),
                repeatMode: repeatLabel(player.repeatMode),
                playbackRate: player.playbackRate,
                duration: player.duration,
                elapsedTime: player.elapsedTime,
                supportedCommands: player.supportedCommands.map(c => commandLabel(c.command))
            }))
        }));
    }

    async #connectAppleTV(airplayResult: DiscoveryResult): Promise<void> {
        const companionResult = this.#companionDevices.find(d =>
            d.id === airplayResult.id ||
            d.address === airplayResult.address ||
            d.fqdn === airplayResult.fqdn
        );

        if (!companionResult) {
            throw new Error('Companion Link device not found for this Apple TV');
        }

        const airplayCredentials = getSavedCredentials(this.#storage, airplayResult, 'airplay');

        let companionLinkCredentials: AccessoryCredentials;
        try {
            companionLinkCredentials = getSavedCredentials(this.#storage, companionResult, 'companionLink');
        } catch {
            companionLinkCredentials = getSavedCredentials(this.#storage, airplayResult, 'companionLink');
        }

        const device = new AppleTV(airplayResult, companionResult);

        this.#deviceInfo = {
            id: airplayResult.id,
            name: airplayResult.fqdn,
            model: airplayResult.txt.model ?? 'Unknown',
            address: airplayResult.address,
            type: 'appletv',
            protocols: ['airplay', 'companionLink'],
            paired: []
        };

        this.#device = device;
        this.#setupAppleTVEvents(device);

        await device.connect(airplayCredentials, companionLinkCredentials);
        this.#emit('connected', this.#deviceInfo);
    }

    async #connectHomePod(airplayResult: DiscoveryResult): Promise<void> {
        const device = new HomePod(airplayResult);

        this.#deviceInfo = {
            id: airplayResult.id,
            name: airplayResult.fqdn,
            model: airplayResult.txt.model ?? 'Unknown',
            address: airplayResult.address,
            type: 'homepod',
            protocols: ['airplay'],
            paired: []
        };

        this.#device = device;
        this.#setupHomePodEvents(device);

        await device.connect();
        this.#emit('connected', this.#deviceInfo);
    }

    #setupAppleTVEvents(device: AppleTV): void {
        device.on('disconnected', (unexpected) => {
            this.#device = null;
            this.#deviceInfo = null;
            this.#emit('disconnected', {unexpected});
        });

        device.state.on('setState', () => this.#emitState());
        device.state.on('volumeDidChange', () => this.#emitState());
        device.state.on('clients', () => this.#emitState());
    }

    #setupHomePodEvents(device: HomePod): void {
        device.on('disconnected', (unexpected) => {
            this.#device = null;
            this.#deviceInfo = null;
            this.#emit('disconnected', {unexpected});
        });

        device.state.on('setState', () => this.#emitState());
        device.state.on('volumeDidChange', () => this.#emitState());
    }

    #emitState(): void {
        this.#emit('state', this.getState());
    }

    get isPairing(): boolean {
        return this.#pairingResolve !== null;
    }

    async startPairing(deviceId: string, protocol: 'airplay' | 'companionLink'): Promise<void> {
        if (this.#pairingResolve) {
            throw new Error('A pairing session is already active');
        }

        if (protocol === 'airplay') {
            await this.#pairAirPlay(deviceId);
        } else {
            await this.#pairCompanionLink(deviceId);
        }
    }

    submitPairingPin(pin: string): void {
        if (!this.#pairingResolve) {
            throw new Error('No pairing session waiting for PIN');
        }

        this.#pairingResolve(pin);
        this.#pairingResolve = null;
    }

    cancelPairing(): void {
        this.#pairingResolve = null;

        if (this.#pairingProtocol) {
            this.#pairingProtocol.disconnect();
            this.#pairingProtocol = null;
        }

        this.#emit('pairingEnded', {success: false, error: 'Cancelled'});
    }

    async #pairAirPlay(deviceId: string): Promise<void> {
        const device = this.#airplayDevices.find(d => d.id === deviceId);

        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        const protocol = new AirPlay.Protocol(device);
        this.#pairingProtocol = protocol;

        this.#emit('pairingStarted', {deviceId, protocol: 'airplay', deviceName: device.fqdn});

        try {
            await protocol.connect();
            await protocol.fetchInfo();
            await protocol.pairing.start();

            const credentials = await protocol.pairing.pin(async () => {
                this.#emit('pairingPinRequested', null);

                return new Promise<string>((resolve) => {
                    this.#pairingResolve = resolve;
                });
            });

            this.#storage.setDevice(device.id, {
                identifier: device.id,
                name: device.fqdn
            });
            this.#storage.setCredentials(device.id, 'airplay', credentials);
            await this.#storage.save();

            this.#emit('pairingEnded', {success: true});
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.#emit('pairingEnded', {success: false, error: message});
        } finally {
            protocol.disconnect();
            this.#pairingProtocol = null;
            this.#pairingResolve = null;
        }
    }

    async #pairCompanionLink(deviceId: string): Promise<void> {
        const device = this.#companionDevices.find(d => d.id === deviceId)
            ?? this.#airplayDevices.find(d => d.id === deviceId);

        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        const clDevice = this.#companionDevices.find(d =>
            d.id === device.id ||
            d.address === device.address ||
            d.fqdn === device.fqdn
        );

        if (!clDevice) {
            throw new Error('Companion Link service not found for this device');
        }

        const protocol = new CompanionLink.Protocol(clDevice);
        this.#pairingProtocol = protocol;

        this.#emit('pairingStarted', {deviceId, protocol: 'companionLink', deviceName: clDevice.fqdn});

        try {
            await protocol.connect();
            await protocol.pairing.start();

            const credentials = await protocol.pairing.pin(async () => {
                this.#emit('pairingPinRequested', null);

                return new Promise<string>((resolve) => {
                    this.#pairingResolve = resolve;
                });
            });

            this.#storage.setDevice(clDevice.id, {
                identifier: clDevice.id,
                name: clDevice.fqdn
            });
            this.#storage.setCredentials(clDevice.id, 'companionLink', credentials);
            await this.#storage.save();

            this.#emit('pairingEnded', {success: true});
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.#emit('pairingEnded', {success: false, error: message});
        } finally {
            protocol.disconnect();
            this.#pairingProtocol = null;
            this.#pairingResolve = null;
        }
    }
}
