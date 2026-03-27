import { Discovery, type AccessoryCredentials, type DiscoveryResult, type Storage, TimingServer } from '@basmilius/apple-common';
import { Url } from '@basmilius/apple-audio-source';
import * as AirPlay from '@basmilius/apple-airplay';
import { Proto } from '@basmilius/apple-airplay';
import * as CompanionLink from '@basmilius/apple-companion-link';
import { COMPANION_LINK_PROTOCOL, AppleTV, HomePod } from '@basmilius/apple-sdk';
import type { AirPlayPlayer, AirPlayState } from '@basmilius/apple-sdk';
import getSavedCredentials from '../getSavedCredentials';
import { PlaybackStateLabel } from '../util';

/** Set to true to include non-Apple TV / HomePod devices in the scan results. */
const SCAN_SHOW_UNSUPPORTED_DEVICES = false;

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
    participants: ParticipantSnapshot[];
    clients: ClientSnapshot[];
};

type ParticipantSnapshot = {
    identifier: string;
    displayName: string;
    type: string;
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
    #companionLinkReady = false;
    #timingServer: TimingServer | null = null;
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

    #detectDeviceType(model: string): DeviceInfo['type'] {
        if (model.startsWith('AppleTV')) {
            return 'appletv';
        } else if (/^AudioAccessory5,/.test(model)) {
            return 'homepod-mini';
        } else if (/^AudioAccessory[16],/.test(model)) {
            return 'homepod';
        }

        return 'other';
    }

    async discover(): Promise<DeviceInfo[]> {
        const [airplayDevices, companionDevices] = await Promise.all([
            Discovery.airplay().find(false),
            Discovery.companionLink().find(false)
        ]);

        this.#airplayDevices = airplayDevices;
        this.#companionDevices = companionDevices;

        const devicesMap = new Map<string, DeviceInfo>();

        for (const device of airplayDevices) {
            const model = device.txt.model ?? '';

            const type = this.#detectDeviceType(model);

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

            const key = device.address;
            const existing = devicesMap.get(key);

            // Keep the entry with the most info (known model wins over Unknown).
            if (!existing || (existing.model === 'Unknown' && model)) {
                devicesMap.set(key, {
                    id: device.id,
                    name: device.fqdn,
                    model: model || 'Unknown',
                    address: device.address,
                    type,
                    protocols,
                    paired
                });
            }
        }

        const devices = Array.from(devicesMap.values());

        if (!SCAN_SHOW_UNSUPPORTED_DEVICES) {
            return devices.filter(d => d.type !== 'other');
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

        if (this.#timingServer) {
            this.#timingServer.close();
            this.#timingServer = null;
        }

        this.#device = null;
        this.#deviceInfo = null;
        this.#companionLinkReady = false;
        this.#emit('disconnected', null);
    }

    async executeCommand(cmd: string, arg?: string): Promise<unknown> {
        const device = this.#device;

        if (!device) {
            throw new Error('No device connected');
        }

        switch (cmd) {
            case 'play': await device.playback.play(); break;
            case 'pause': await device.playback.pause(); break;
            case 'playpause': await device.playback.playPause(); break;
            case 'stop': await device.playback.stop(); break;
            case 'next': await device.playback.next(); break;
            case 'previous': await device.playback.previous(); break;
            case 'volup':
                await device.volume.up();
                break;
            case 'voldown':
                await device.volume.down();
                break;
            case 'mute':
                await device.volume.mute();
                break;
            case 'vol':
                if (arg) {
                    const pct = parseInt(arg) / 100;
                    await device.volume.set(pct);
                }
                return {volume: Math.round(device.state.volume * 100)};

            // Streaming (both device types)
            case 'stream':
                if (arg) {
                    await this.#ensureTimingServer();
                    const audioSource = await Url.fromUrl(arg);

                    // Fire-and-forget: streaming blocks until audio ends, so
                    // we start it in the background and return immediately.
                    const streamPromise = device.media.streamAudio(audioSource);

                    streamPromise.catch((err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        this.#emit('log', {level: 'error', message: `Stream error: ${message}`});
                    });
                }
                break;
            case 'stopstream':
                device.media.stopStreamAudio();
                break;
            case 'playurl':
                if (arg) {
                    await this.#ensureTimingServer();
                    await device.media.playUrl(arg);
                }
                break;
            case 'stopplayurl':
                device.media.stopPlayUrl();
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
            case 'back': await this.#requireAppleTV().remote.menu(); break;
            case 'power': {
                const atv = this.#requireAppleTV();
                if (atv.state.isPlaying) {
                    await atv.power.off();
                } else {
                    await atv.power.on();
                }
                break;
            }
            case 'wake': await this.#requireAppleTV().power.on(); break;
            case 'suspend': await this.#requireAppleTV().power.off(); break;

            // Swipe & tap
            case 'swipeup': await this.#requireAppleTV().remote.swipe('up'); break;
            case 'swipedown': await this.#requireAppleTV().remote.swipe('down'); break;
            case 'swipeleft': await this.#requireAppleTV().remote.swipe('left'); break;
            case 'swiperight': await this.#requireAppleTV().remote.swipe('right'); break;
            case 'tap': await this.#requireAppleTV().remote.tap(200, 200); break;
            case 'clswipeup': await this.#requireAppleTV().companionLink.swipe('up'); break;
            case 'clswipedown': await this.#requireAppleTV().companionLink.swipe('down'); break;
            case 'clswipeleft': await this.#requireAppleTV().companionLink.swipe('left'); break;
            case 'clswiperight': await this.#requireAppleTV().companionLink.swipe('right'); break;
            case 'cltap': await this.#requireAppleTV().companionLink.tap(); break;

            // Text input
            case 'type':
                if (arg) {
                    await this.#requireAppleTV().keyboard.type(arg);
                }
                break;
            case 'append':
                if (arg) {
                    await this.#requireAppleTV().keyboard.append(arg);
                }
                break;
            case 'textclear': await this.#requireAppleTV().keyboard.clear(); break;

            // Skip
            case 'skipforward': {
                const seconds = parseInt(arg || '15');
                await this.#requireAppleTV().playback.skipForward(seconds);
                break;
            }
            case 'skipbackward': {
                const seconds = parseInt(arg || '15');
                await this.#requireAppleTV().playback.skipBackward(seconds);
                break;
            }

            // Companion Link features
            case 'captions': await this.#requireAppleTV().system.toggleCaptions(); break;
            case 'darkmode': await this.#requireAppleTV().system.setAppearance('dark'); break;
            case 'lightmode': await this.#requireAppleTV().system.setAppearance('light'); break;
            case 'siristart': await this.#requireAppleTV().system.siriStart(); break;
            case 'siristop': await this.#requireAppleTV().system.siriStop(); break;
            case 'findremote': await this.#requireAppleTV().system.setFindingMode(true); break;

            // Info & debug
            case 'apps': {
                const apps = await this.#requireAppleTV().apps.list();
                return apps;
            }
            case 'launch':
                if (arg) {
                    await this.#requireAppleTV().apps.launch(arg);
                }
                break;
            case 'users': {
                const users = await this.#requireAppleTV().accounts.list();
                return users;
            }
            case 'switchuser':
                if (arg) {
                    await this.#requireAppleTV().accounts.switch(arg);
                }
                break;
            case 'clnpi': {
                const npi = await this.#requireAppleTV().companionLink.fetchNowPlayingInfo();
                return npi;
            }
            case 'upnext': {
                const upNext = await this.#requireAppleTV().system.fetchUpNext();
                return upNext;
            }
            case 'fetch':
                if (device instanceof AppleTV) {
                    await device.playback.requestPlaybackQueue(1);
                }
                break;
            case 'hidtest':
                if (arg) {
                    const hidId = parseInt(arg);
                    const clp = (this.#requireAppleTV().companionLink as any)[COMPANION_LINK_PROTOCOL];
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
                participants: [],
                clients: []
            };
        }

        const airplayState = device.airplay.state;
        const npc = airplayState.nowPlayingClient;
        const activePlayer = npc?.activePlayer;
        const isAppleTV = device instanceof AppleTV;

        return {
            connected: true,
            device: this.#deviceInfo,
            airplay: {
                connected: isAppleTV ? device.airplay.isConnected : true
            },
            companionLink: isAppleTV ? {
                connected: this.#companionLinkReady
            } : null,
            nowPlaying: {
                title: device.state.title || '',
                artist: device.state.artist || '',
                album: device.state.album || '',
                duration: device.state.duration,
                elapsedTime: device.state.elapsedTime,
                playbackState: PlaybackStateLabel[device.state.playbackState] ?? 'Unknown',
                artworkUrl: activePlayer?.artworkUrl() ?? this.#artworkDataUrl(activePlayer, airplayState) ?? null,
                app: device.state.activeApp?.displayName ?? null,
                bundleIdentifier: device.state.activeApp?.bundleIdentifier ?? null
            },
            volume: {
                level: Math.round(device.state.volume * 100),
                available: airplayState.volumeAvailable,
                muted: airplayState.volumeMuted
            },
            participants: airplayState.participants.map(p => ({
                identifier: p.identity?.identifier ?? p.identifier ?? '',
                displayName: p.identity?.displayName ?? p.identifier ?? 'Unknown',
                type: ['Unknown', 'AppleID', 'DeviceLocal'][p.identity?.type ?? 0] ?? 'Unknown'
            })),
            clients: this.#buildClientSnapshots(airplayState)
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

    async #ensureTimingServer(): Promise<void> {
        if (this.#timingServer) {
            return;
        }

        const timingServer = new TimingServer();
        await timingServer.listen();
        this.#timingServer = timingServer;

        if (this.#device) {
            this.#device.timingServer = timingServer;
        }
    }

    #requireAppleTV(): AppleTV {
        if (!(this.#device instanceof AppleTV)) {
            throw new Error('This command requires an Apple TV');
        }

        return this.#device;
    }

    #artworkDataUrl(player: AirPlayPlayer | undefined, state: AirPlayState): string | null {
        // Priority 1: Inline artwork from playback queue content item.
        const inlineData = player?.currentItemArtwork;

        if (inlineData && inlineData.byteLength > 0) {
            const mime = player?.currentItemMetadata?.artworkMIMEType || 'image/jpeg';
            return `data:${mime};base64,${Buffer.from(inlineData).toString('base64')}`;
        }

        // Priority 2: JPEG data from SET_ARTWORK_MESSAGE.
        const setArtworkData = state.artworkJpegData;

        if (setArtworkData && setArtworkData.byteLength > 0) {
            return `data:image/jpeg;base64,${Buffer.from(setArtworkData).toString('base64')}`;
        }

        return null;
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

        const device = new AppleTV({ airplay: airplayResult, companionLink: companionResult });

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

        // Connect AirPlay first, then Companion Link in the background
        // so the UI responds immediately after AirPlay is ready.
        device.airplay.setCredentials(airplayCredentials);
        await device.airplay.connect();
        this.#emit('connected', this.#deviceInfo);

        // Connect Companion Link in the background.
        await device.companionLink.setCredentials(companionLinkCredentials);
        device.companionLink.connect()
            .then(() => {
                this.#companionLinkReady = true;
                this.#emitState();
            })
            .catch((err) => {
                console.error('Companion Link connection failed:', err);
                this.#emitState();
            });
    }

    async #connectHomePod(airplayResult: DiscoveryResult): Promise<void> {
        const device = new HomePod({ airplay: airplayResult });

        this.#deviceInfo = {
            id: airplayResult.id,
            name: airplayResult.fqdn,
            model: airplayResult.txt.model ?? 'Unknown',
            address: airplayResult.address,
            type: this.#detectDeviceType(airplayResult.txt.model ?? ''),
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

            if (this.#timingServer) {
                this.#timingServer.close();
                this.#timingServer = null;
            }

            this.#emit('disconnected', {unexpected});
        });

        device.airplay.state.on('setState', () => this.#emitState());
        device.airplay.state.on('volumeDidChange', () => this.#emitState());
        device.airplay.state.on('clients', () => this.#emitState());
        device.airplay.state.on('playerClientParticipantsUpdate', () => this.#emitState());
        device.airplay.state.on('setArtwork', () => this.#emitState());
    }

    #setupHomePodEvents(device: HomePod): void {
        device.on('disconnected', (unexpected) => {
            this.#device = null;
            this.#deviceInfo = null;

            if (this.#timingServer) {
                this.#timingServer.close();
                this.#timingServer = null;
            }

            this.#emit('disconnected', {unexpected});
        });

        device.airplay.state.on('setState', () => this.#emitState());
        device.airplay.state.on('volumeDidChange', () => this.#emitState());
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
