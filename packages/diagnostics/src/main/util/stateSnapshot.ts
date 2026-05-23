import { Proto } from '@basmilius/apple-airplay';
import { AppleTV, type HomePod } from '@basmilius/apple-sdk';
import type { AirPlayClient, AirPlayPlayer, AirPlayState } from '@basmilius/apple-sdk';
import type {
    AttentionState,
    ClientSnapshot,
    DeviceInfo,
    MediaTypeLabel,
    NowPlayingSnapshot,
    ParticipantSnapshot,
    PlaybackStateLabel,
    PlayerSnapshot,
    RepeatModeLabel,
    ShuffleModeLabel,
    StateSnapshot,
    VolumeSnapshot
} from '@shared/snapshots';

const PLAYBACK_STATE: Record<number, PlaybackStateLabel> = {
    0: 'Unknown',
    1: 'Stopped',
    2: 'Playing',
    3: 'Paused',
    4: 'Interrupted',
    5: 'Seeking'
};

const SHUFFLE_MODE: Record<number, ShuffleModeLabel> = {
    0: 'Unknown',
    1: 'Off',
    2: 'Albums',
    3: 'Songs'
};

const REPEAT_MODE: Record<number, RepeatModeLabel> = {
    0: 'Unknown',
    1: 'Off',
    2: 'One',
    3: 'All'
};

const MEDIA_TYPE: Record<number, MediaTypeLabel> = {
    0: 'Unknown',
    1: 'Audio',
    2: 'Video'
};

const PARTICIPANT_TYPE: Record<number, ParticipantSnapshot['type']> = {
    0: 'Unknown',
    1: 'AppleID',
    2: 'DeviceLocal'
};

function commandLabel(command: number): string {
    return Proto.Command[command] ?? String(command);
}

function playbackLabel(state: number | undefined): PlaybackStateLabel {
    return PLAYBACK_STATE[state ?? 0] ?? 'Unknown';
}

function shuffleLabel(mode: number | undefined): ShuffleModeLabel {
    return SHUFFLE_MODE[mode ?? 0] ?? 'Unknown';
}

function repeatLabel(mode: number | undefined): RepeatModeLabel {
    return REPEAT_MODE[mode ?? 0] ?? 'Unknown';
}

function mediaTypeLabel(type: number | undefined): MediaTypeLabel {
    return MEDIA_TYPE[type ?? 0] ?? 'Unknown';
}

function participantTypeLabel(type: number | undefined): ParticipantSnapshot['type'] {
    return PARTICIPANT_TYPE[type ?? 0] ?? 'Unknown';
}

function artworkDataUrl(player: AirPlayPlayer | null, state: AirPlayState): string | null {
    if (player) {
        const inline = player.currentItemArtwork;

        if (inline && inline.byteLength > 0) {
            const mime = player.currentItemMetadata?.artworkMIMEType || 'image/jpeg';
            return `data:${mime};base64,${Buffer.from(inline).toString('base64')}`;
        }
    }

    const setArtworkData = state.artworkJpegData;

    if (setArtworkData && setArtworkData.byteLength > 0) {
        return `data:image/jpeg;base64,${Buffer.from(setArtworkData).toString('base64')}`;
    }

    return null;
}

function buildPlayerSnapshot(player: AirPlayPlayer, activeIdentifier: string | undefined): PlayerSnapshot {
    return {
        identifier: player.identifier,
        displayName: player.displayName,
        isActive: player.identifier === activeIdentifier,
        isDefaultPlayer: player.isDefaultPlayer,
        playbackState: playbackLabel(player.playbackState),
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
    };
}

function buildClientSnapshots(state: AirPlayState): ClientSnapshot[] {
    const clients = Object.values(state.clients);
    const nowPlayingClient = state.nowPlayingClient;

    return clients.map(client => {
        const activePlayerId = client.activePlayer?.identifier;

        return {
            bundleIdentifier: client.bundleIdentifier,
            displayName: client.displayName,
            isActive: client.bundleIdentifier === nowPlayingClient?.bundleIdentifier,
            playbackState: playbackLabel(client.playbackState),
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
            players: Array.from(client.players.values()).map(player =>
                buildPlayerSnapshot(player, activePlayerId)
            )
        };
    });
}

function buildParticipants(state: AirPlayState): ParticipantSnapshot[] {
    return state.participants.map(participant => ({
        identifier: participant.identity?.identifier ?? participant.identifier ?? '',
        displayName: participant.identity?.displayName ?? participant.identifier ?? 'Unknown',
        type: participantTypeLabel(participant.identity?.type)
    }));
}

function buildNowPlaying(
    state: AirPlayState,
    client: AirPlayClient | null,
    player: AirPlayPlayer | null
): NowPlayingSnapshot {
    return {
        title: client?.title ?? '',
        artist: client?.artist ?? '',
        album: client?.album ?? '',
        genre: client?.genre ?? '',
        duration: client?.duration ?? 0,
        elapsedTime: client?.elapsedTime ?? 0,
        playbackState: playbackLabel(client?.playbackState),
        artworkUrl: player?.artworkUrl() ?? artworkDataUrl(player, state),
        app: client?.displayName ?? null,
        bundleIdentifier: client?.bundleIdentifier ?? null,
        mediaType: mediaTypeLabel(client?.mediaType),
        repeatMode: repeatLabel(client?.repeatMode),
        shuffleMode: shuffleLabel(client?.shuffleMode),
        repeatSupported: client?.isCommandSupported(Proto.Command.ChangeRepeatMode) ?? false,
        shuffleSupported: client?.isCommandSupported(Proto.Command.ChangeShuffleMode) ?? false
    };
}

function buildVolume(state: AirPlayState): VolumeSnapshot {
    return {
        level: Math.round(state.volume * 100),
        available: state.volumeAvailable,
        muted: state.volumeMuted
    };
}

export type SnapshotContext = {
    device: AppleTV | HomePod;
    deviceInfo: DeviceInfo;
    companionLinkReady: boolean;
    powerState: AttentionState | null;
};

export function buildStateSnapshot(ctx: SnapshotContext): StateSnapshot {
    const {device, deviceInfo, companionLinkReady, powerState} = ctx;

    const isAppleTV = device instanceof AppleTV;
    const airplayState = device.airplay.state;
    const client = airplayState.nowPlayingClient;
    const player = client?.activePlayer ?? null;

    return {
        connected: true,
        device: deviceInfo,
        airplay: {
            connected: device.airplay.isConnected
        },
        companionLink: isAppleTV ? {
            connected: companionLinkReady
        } : null,
        power: isAppleTV ? {
            state: powerState ?? 'unknown'
        } : null,
        nowPlaying: buildNowPlaying(airplayState, client, player),
        volume: buildVolume(airplayState),
        participants: buildParticipants(airplayState),
        clients: buildClientSnapshots(airplayState)
    };
}
