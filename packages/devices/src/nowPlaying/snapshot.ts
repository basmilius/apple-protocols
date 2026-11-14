import { type Client, DEFAULT_PLAYER_ID, Proto } from '@corewire/airplay/mrp';
import type { MediaKind, NowPlaying, NowPlayingCommand, PlaybackState, RepeatMode, ShuffleMode } from '../types';

const PLAYBACK_STATES: Record<number, PlaybackState> = {
    [Proto.PlaybackState_Enum.Playing]: 'playing',
    [Proto.PlaybackState_Enum.Paused]: 'paused',
    [Proto.PlaybackState_Enum.Stopped]: 'stopped',
    [Proto.PlaybackState_Enum.Interrupted]: 'interrupted',
    [Proto.PlaybackState_Enum.Seeking]: 'seeking'
};

const REPEAT_MODES: Record<number, RepeatMode> = {
    [Proto.RepeatMode_Enum.One]: 'one',
    [Proto.RepeatMode_Enum.All]: 'all'
};

const SHUFFLE_MODES: Record<number, ShuffleMode> = {
    [Proto.ShuffleMode_Enum.Albums]: 'albums',
    [Proto.ShuffleMode_Enum.Songs]: 'songs'
};

const MEDIA_KINDS: Record<number, MediaKind> = {
    [Proto.ContentItemMetadata_MediaType.Audio]: 'audio',
    [Proto.ContentItemMetadata_MediaType.Video]: 'video'
};

export const COMMANDS: Record<NowPlayingCommand, Proto.Command> = {
    play: Proto.Command.Play,
    pause: Proto.Command.Pause,
    togglePlayPause: Proto.Command.TogglePlayPause,
    stop: Proto.Command.Stop,
    next: Proto.Command.NextTrack,
    previous: Proto.Command.PreviousTrack,
    skipForward: Proto.Command.SkipForward,
    skipBackward: Proto.Command.SkipBackward,
    seek: Proto.Command.SeekToPlaybackPosition,
    repeat: Proto.Command.ChangeRepeatMode,
    shuffle: Proto.Command.ChangeShuffleMode,
    rate: Proto.Command.ChangePlaybackRate
};

export const REPEAT_TO_PROTO: Record<RepeatMode, Proto.RepeatMode_Enum> = {
    off: Proto.RepeatMode_Enum.Off,
    one: Proto.RepeatMode_Enum.One,
    all: Proto.RepeatMode_Enum.All
};

export const SHUFFLE_TO_PROTO: Record<ShuffleMode, Proto.ShuffleMode_Enum> = {
    off: Proto.ShuffleMode_Enum.Off,
    albums: Proto.ShuffleMode_Enum.Albums,
    songs: Proto.ShuffleMode_Enum.Songs
};

export function playbackStateOf(state: Proto.PlaybackState_Enum): PlaybackState {
    return PLAYBACK_STATES[state] ?? 'unknown';
}

/** What plays in the app of the client, through the client's view of its active player. */
export function toNowPlaying(client: Client | null): NowPlaying | null {
    if (!client) {
        return null;
    }

    const metadata = client.currentItemMetadata;
    const seriesName = client.seriesName;
    const season = client.seasonNumber;
    const episode = client.episodeNumber;
    const episodeTitle = client.episodeTitle;

    return {
        app: {bundleId: client.bundleIdentifier, name: client.displayName},
        player: client.activePlayer?.identifier ?? DEFAULT_PLAYER_ID,
        state: playbackStateOf(client.playbackState),
        title: client.title,
        artist: client.artist,
        trackArtist: metadata?.trackArtistName ?? '',
        album: client.album,
        genre: client.genre,
        duration: client.duration,
        rate: client.playbackRate,
        repeat: REPEAT_MODES[client.repeatMode] ?? 'off',
        shuffle: SHUFFLE_MODES[client.shuffleMode] ?? 'off',
        kind: MEDIA_KINDS[client.mediaType] ?? 'unknown',
        series: seriesName || season || episode || episodeTitle ? {name: seriesName, season, episode, episodeTitle} : null,
        contentRating: client.contentRating,
        contentIdentifier: client.contentIdentifier,
        artworkId: client.artworkId,
        storeAlbumId: idOf(metadata?.iTunesStoreAlbumIdentifier),
        lyricsId: idOf(metadata?.lyricsAdamID),
        isAlwaysLive: client.nowPlayingInfo?.isAlwaysLive ?? false,
        isAdvertisement: client.nowPlayingInfo?.isAdvertisement ?? false
    };
}

function idOf(value: bigint | number | undefined | null): string | null {
    if (value === undefined || value === null || BigInt(value) === 0n) {
        return null;
    }

    return value.toString();
}
