import { type Client as AirPlayClient, MediaRemoteState as AirPlayState, type Player as AirPlayPlayer, Proto } from '@corewire/airplay/mrp';
import type { AppleTV, AppleTVCapability, HomePod, PlaybackState } from '@corewire/devices';
import type {
    ClientSnapshot,
    ConnectionSnapshot,
    DeviceInfoSnapshot,
    DeviceSessionStatus,
    DeviceType,
    KeyboardSnapshot,
    NowPlayingSnapshot,
    OutputDeviceSnapshot,
    ParticipantSnapshot,
    PlayerSnapshot,
    StateSnapshot,
    VolumeControl,
    VolumeSnapshot
} from '@shared/contract';

type Device = AppleTV | HomePod;

const PLAYBACK_STATE: Record<number, string> = {
    [Proto.PlaybackState_Enum.Unknown]: 'Unknown',
    [Proto.PlaybackState_Enum.Playing]: 'Playing',
    [Proto.PlaybackState_Enum.Paused]: 'Paused',
    [Proto.PlaybackState_Enum.Stopped]: 'Stopped',
    [Proto.PlaybackState_Enum.Interrupted]: 'Interrupted',
    [Proto.PlaybackState_Enum.Seeking]: 'Seeking'
};

const PLAYBACK_LABEL: Record<PlaybackState, string> = {
    unknown: 'Unknown',
    playing: 'Playing',
    paused: 'Paused',
    stopped: 'Stopped',
    interrupted: 'Interrupted',
    seeking: 'Seeking'
};

const CAPABILITIES: readonly AppleTVCapability[] = ['remote', 'nowPlaying', 'playback', 'volume', 'artwork', 'multiroom', 'streamAudio', 'playUrl', 'text', 'power', 'apps', 'accounts', 'system', 'touch'];

/** What the snapshot reads while AirPlay is down. */
const EMPTY_STATE = new AirPlayState();

const SHUFFLE = ['Unknown', 'Off', 'Albums', 'Songs'];
const REPEAT = ['Unknown', 'Off', 'One', 'All'];
const MEDIA_TYPE = ['Unknown', 'Audio', 'Video'];
const PARTICIPANT_TYPE = ['Unknown', 'AppleID', 'DeviceLocal'];

export type SnapshotInput = {
    readonly deviceId: string;
    readonly device: Device | null;
    readonly deviceType: DeviceType;
    readonly status: DeviceSessionStatus;
    readonly error: string | null;
    readonly artworkUrl: string | null;
};

export function emptySnapshot(deviceId: string, status: DeviceSessionStatus = 'disconnected', error: string | null = null): StateSnapshot {
    return {
        deviceId,
        connection: {
            status,
            connected: false,
            airplay: {available: false, connected: false},
            companionLink: {available: false, connected: false},
            error
        },
        device: null,
        nowPlaying: emptyNowPlaying(),
        volume: {level: 0, available: false, muted: false, control: 'none'},
        keyboard: {active: false, text: null, placeholder: null},
        cluster: {clusterId: null, isLeader: false, isClusterAware: false},
        outputDevices: [],
        participants: [],
        clients: [],
        supportedCommands: [],
        updatedAt: Date.now()
    };
}

/** Builds a snapshot from cached state. Artwork is supplied by the session to avoid fetching here. */
export function buildSnapshot(input: SnapshotInput): StateSnapshot {
    const {device} = input;

    if (device === null) {
        return {...emptySnapshot(input.deviceId, input.status, input.error)};
    }

    const state = device.sessions.mediaRemote?.state ?? EMPTY_STATE;
    const client = state.nowPlayingClient;
    const player = client?.activePlayer ?? null;

    return {
        deviceId: input.deviceId,
        connection: connectionOf(device, input.status, input.error),
        device: infoOf(device, input.deviceType),
        nowPlaying: nowPlayingOf(device, input.artworkUrl),
        volume: volumeOf(state),
        keyboard: keyboardOf(state),
        cluster: {
            clusterId: state.clusterID,
            isLeader: state.isClusterLeader,
            isClusterAware: state.isClusterAware
        },
        outputDevices: state.outputDevices.map(outputDeviceOf),
        participants: state.participants.map(participantOf),
        clients: Object.values(state.clients).map(entry => clientOf(entry, client)),
        supportedCommands: (player?.supportedCommands ?? []).map(command => commandName(command.command)),
        updatedAt: Date.now()
    };
}

function connectionOf(device: Device, status: DeviceSessionStatus, error: string | null): ConnectionSnapshot {
    const airplay = device.status.airplay.state === 'connected';
    const companionLink = device.status.companionLink;

    return {
        status,
        connected: airplay,
        airplay: {available: true, connected: airplay},
        companionLink: {available: companionLink !== undefined && companionLink.state !== 'off', connected: companionLink?.state === 'connected'},
        error
    };
}

function infoOf(device: Device, deviceType: DeviceType): DeviceInfoSnapshot {
    const capabilities: Record<string, boolean> = {};

    for (const capability of CAPABILITIES) {
        capabilities[capability] = (device as AppleTV).supports(capability);
    }

    return {
        id: device.id,
        name: device.name,
        address: device.address,
        modelName: device.modelName,
        deviceType,
        receiverInfo: (device.sessions.airplay?.info as Record<string, unknown> | undefined) ?? null,
        capabilities
    };
}

function emptyNowPlaying(): NowPlayingSnapshot {
    return {
        title: '',
        artist: '',
        album: '',
        genre: '',
        duration: 0,
        elapsedTime: 0,
        playbackRate: 0,
        playbackState: 'Unknown',
        mediaType: 'Unknown',
        artworkUrl: null,
        appName: null,
        bundleIdentifier: null
    };
}

function nowPlayingOf(device: Device, artworkUrl: string | null): NowPlayingSnapshot {
    const item = device.nowPlaying.current;

    if (!item) {
        return {...emptyNowPlaying(), artworkUrl};
    }

    return {
        title: item.title,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        duration: item.duration,
        elapsedTime: device.nowPlaying.elapsed,
        playbackRate: item.rate,
        playbackState: PLAYBACK_LABEL[item.state],
        mediaType: item.kind === 'audio' ? 'Audio' : item.kind === 'video' ? 'Video' : 'Unknown',
        artworkUrl,
        appName: item.app.name,
        bundleIdentifier: item.app.bundleId
    };
}

const VOLUME_CONTROL: Record<number, VolumeControl> = {
    [Proto.VolumeCapabilities_Enum.None]: 'none',
    [Proto.VolumeCapabilities_Enum.Relative]: 'relative',
    [Proto.VolumeCapabilities_Enum.Absolute]: 'absolute',
    [Proto.VolumeCapabilities_Enum.Both]: 'both'
};

function volumeOf(state: AirPlayState): VolumeSnapshot {
    return {
        level: Math.round(state.volume * 100),
        available: state.volumeAvailable,
        muted: state.volumeMuted,
        control: VOLUME_CONTROL[state.volumeCapabilities] ?? 'none'
    };
}

function keyboardOf(state: AirPlayState): KeyboardSnapshot {
    const attributes = state.keyboardAttributes;

    return {
        active: state.isKeyboardActive,
        text: attributes?.title || null,
        placeholder: attributes?.prompt || null
    };
}

function outputDeviceOf(descriptor: Proto.AVOutputDeviceDescriptor): OutputDeviceSnapshot {
    return {
        uid: descriptor.uniqueIdentifier,
        name: descriptor.name,
        modelId: descriptor.modelID,
        isLocal: descriptor.isLocalDevice,
        isGroupLeader: descriptor.isGroupLeader,
        volume: typeof (descriptor as { volume?: number }).volume === 'number' ? (descriptor as { volume: number }).volume : 0
    };
}

function participantOf(participant: Proto.PlaybackQueueParticipant): ParticipantSnapshot {
    return {
        identifier: participant.identity?.identifier ?? participant.identifier ?? '',
        displayName: participant.identity?.displayName ?? participant.identifier ?? 'Unknown',
        type: indexed(PARTICIPANT_TYPE, participant.identity?.type)
    };
}

function clientOf(client: AirPlayClient, active: AirPlayClient | null): ClientSnapshot {
    return {
        bundleIdentifier: client.bundleIdentifier,
        displayName: client.displayName,
        isActive: client.bundleIdentifier === active?.bundleIdentifier,
        playbackState: label(PLAYBACK_STATE, client.playbackState),
        title: client.title,
        artist: client.artist,
        album: client.album,
        genre: client.genre,
        mediaType: indexed(MEDIA_TYPE, client.mediaType),
        contentIdentifier: client.contentIdentifier,
        shuffleMode: indexed(SHUFFLE, client.shuffleMode),
        repeatMode: indexed(REPEAT, client.repeatMode),
        playbackRate: client.playbackRate,
        duration: client.duration,
        elapsedTime: client.elapsedTime,
        players: Array.from(client.players.values()).map(player => playerOf(player, client))
    };
}

function playerOf(player: AirPlayPlayer, client: AirPlayClient): PlayerSnapshot {
    return {
        identifier: player.identifier,
        displayName: player.displayName,
        isActive: client.activePlayer?.identifier === player.identifier,
        isDefaultPlayer: player.isDefaultPlayer,
        playbackState: label(PLAYBACK_STATE, player.playbackState),
        title: player.title,
        artist: player.artist,
        album: player.album,
        genre: player.genre,
        seriesName: player.seriesName,
        seasonNumber: player.seasonNumber,
        episodeNumber: player.episodeNumber,
        mediaType: indexed(MEDIA_TYPE, player.mediaType),
        contentIdentifier: player.contentIdentifier,
        shuffleMode: indexed(SHUFFLE, player.shuffleMode),
        repeatMode: indexed(REPEAT, player.repeatMode),
        playbackRate: player.playbackRate,
        duration: player.duration,
        elapsedTime: player.elapsedTime,
        supportedCommands: player.supportedCommands.map(command => commandName(command.command))
    };
}

function commandName(command: number): string {
    return Proto.Command[command] ?? String(command);
}

function label(table: Record<number, string>, value: number | undefined): string {
    return value === undefined ? 'Unknown' : (table[value] ?? String(value));
}

function indexed(table: readonly string[], value: number | undefined): string {
    return value === undefined ? 'Unknown' : (table[value] ?? String(value));
}
