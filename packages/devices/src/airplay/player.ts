import { Proto } from '@basmilius/apple-airplay';

/** Offset in seconds between the Cocoa epoch (2001-01-01) and the Unix epoch (1970-01-01). */
const COCOA_EPOCH_OFFSET = 978307200;

/** Default player identifier used by the Apple TV when no specific player is active. */
const DEFAULT_PLAYER_ID = 'MediaRemote-DefaultPlayer';

/**
 * Extrapolates the current elapsed time based on a snapshot timestamp and playback rate.
 * Compensates for the time passed since the timestamp was recorded, scaled by the playback rate.
 *
 * @param elapsed - The elapsed time at the moment of the snapshot, in seconds.
 * @param cocoaTimestamp - The Cocoa epoch timestamp when the snapshot was taken.
 * @param rate - The playback rate (e.g. 1.0 for normal speed, 0 for paused).
 * @returns The extrapolated elapsed time in seconds, clamped to a minimum of 0.
 */
const extrapolateElapsed = (elapsed: number, cocoaTimestamp: number, rate: number | undefined): number => {
    if (!rate) {
        return elapsed;
    }

    const timestampUnix = cocoaTimestamp + COCOA_EPOCH_OFFSET;
    const delta = (Date.now() / 1000 - timestampUnix) * rate;

    return Math.max(0, elapsed + delta);
};

export { DEFAULT_PLAYER_ID };

/**
 * Represents a single media player within an app on the Apple TV.
 * Each app (Client) can have multiple players (e.g. picture-in-picture).
 * Tracks now-playing metadata, playback state, and provides elapsed time extrapolation
 * based on Cocoa timestamps and playback rate.
 */
export default class Player {
    /** Unique identifier for this player (e.g. a player path). */
    get identifier(): string {
        return this.#identifier;
    }

    /** Human-readable display name for this player. */
    get displayName(): string {
        return this.#displayName;
    }

    /** Whether this is the default fallback player (MediaRemote-DefaultPlayer). */
    get isDefaultPlayer(): boolean {
        return this.#identifier === DEFAULT_PLAYER_ID;
    }

    /** Raw now-playing info from the Apple TV, or null if unavailable. */
    get nowPlayingInfo(): Proto.NowPlayingInfo | null {
        return this.#nowPlayingInfo;
    }

    /** Current playback queue, or null if unavailable. */
    get playbackQueue(): Proto.PlaybackQueue | null {
        return this.#playbackQueue;
    }

    /**
     * Effective playback state. Corrects for the edge case where the Apple TV
     * reports Playing but the playback rate is 0 (effectively paused).
     */
    get playbackState(): Proto.PlaybackState_Enum {
        if (this.#playbackState === Proto.PlaybackState_Enum.Playing && this.playbackRate === 0) {
            return Proto.PlaybackState_Enum.Paused;
        }

        return this.#playbackState;
    }

    /** The raw playback state as reported by the Apple TV, without corrections. */
    get rawPlaybackState(): Proto.PlaybackState_Enum {
        return this.#playbackState;
    }

    /** Timestamp of the last playback state update, used to discard stale updates. */
    get playbackStateTimestamp(): number {
        return this.#playbackStateTimestamp;
    }

    /** List of commands supported by this player. */
    get supportedCommands(): Proto.CommandInfo[] {
        return this.#supportedCommands;
    }

    /** Current track title from NowPlayingInfo or content item metadata. */
    get title(): string {
        return this.#nowPlayingInfo?.title || this.currentItemMetadata?.title || '';
    }

    /** Current track artist from NowPlayingInfo or content item metadata. */
    get artist(): string {
        return this.#nowPlayingInfo?.artist || this.currentItemMetadata?.trackArtistName || '';
    }

    /** Current track album from NowPlayingInfo or content item metadata. */
    get album(): string {
        return this.#nowPlayingInfo?.album || this.currentItemMetadata?.albumName || '';
    }

    /** Genre of the current content item. */
    get genre(): string {
        return this.currentItemMetadata?.genre || '';
    }

    /** Series name for TV show content. */
    get seriesName(): string {
        return this.currentItemMetadata?.seriesName || '';
    }

    /** Season number for TV show content, or 0 if not applicable. */
    get seasonNumber(): number {
        return this.currentItemMetadata?.seasonNumber || 0;
    }

    /** Episode number for TV show content, or 0 if not applicable. */
    get episodeNumber(): number {
        return this.currentItemMetadata?.episodeNumber || 0;
    }

    /** Media type of the current content item (music, video, etc.). */
    get mediaType(): Proto.ContentItemMetadata_MediaType {
        return this.currentItemMetadata?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType;
    }

    /** Unique content identifier for the current item (e.g. iTunes store ID). */
    get contentIdentifier(): string {
        return this.currentItemMetadata?.contentIdentifier || '';
    }

    /** Duration of the current track in seconds, from NowPlayingInfo or metadata. */
    get duration(): number {
        return this.#nowPlayingInfo?.duration || this.currentItemMetadata?.duration || 0;
    }

    /** Current playback rate (1.0 = normal, 0 = paused, 2.0 = double speed). */
    get playbackRate(): number {
        return this.#nowPlayingInfo?.playbackRate ?? this.currentItemMetadata?.playbackRate ?? 0;
    }

    /** Whether the player is currently playing (based on effective playback state). */
    get isPlaying(): boolean {
        return this.playbackState === Proto.PlaybackState_Enum.Playing;
    }

    /** Current shuffle mode, derived from the ChangeShuffleMode command info. */
    get shuffleMode(): Proto.ShuffleMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeShuffleMode);

        return info?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown;
    }

    /** Current repeat mode, derived from the ChangeRepeatMode command info. */
    get repeatMode(): Proto.RepeatMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeRepeatMode);

        return info?.repeatMode ?? Proto.RepeatMode_Enum.Unknown;
    }

    /**
     * Extrapolated elapsed time in seconds. Uses the most recent timestamp
     * from either NowPlayingInfo or content item metadata, accounting for
     * playback rate to provide a real-time estimate.
     */
    get elapsedTime(): number {
        const npi = this.#nowPlayingInfo;
        const meta = this.currentItemMetadata;

        const npiValid = npi?.elapsedTime != null && npi.timestamp != null && npi.timestamp !== 0;
        const metaValid = meta?.elapsedTime != null && meta.elapsedTimeTimestamp != null && meta.elapsedTimeTimestamp !== 0;

        if (npiValid && metaValid) {
            // After track restarts or seeks, metadata may have a more
            // recent timestamp than NowPlayingInfo.
            if (meta.elapsedTimeTimestamp > npi.timestamp) {
                return extrapolateElapsed(meta.elapsedTime, meta.elapsedTimeTimestamp, meta.playbackRate);
            }

            return extrapolateElapsed(npi.elapsedTime, npi.timestamp, npi.playbackRate);
        }

        if (npiValid) {
            return extrapolateElapsed(npi.elapsedTime, npi.timestamp, npi.playbackRate);
        }

        if (metaValid) {
            return extrapolateElapsed(meta.elapsedTime, meta.elapsedTimeTimestamp, meta.playbackRate);
        }

        return npi?.elapsedTime || meta?.elapsedTime || 0;
    }

    /** The currently playing content item from the playback queue, or null. */
    get currentItem(): Proto.ContentItem | null {
        if (!this.#playbackQueue || this.#playbackQueue.contentItems.length === 0) {
            return null;
        }

        return this.#playbackQueue.contentItems[this.#playbackQueue.location] ?? this.#playbackQueue.contentItems[0] ?? null;
    }

    /** Metadata of the current content item, or null if no item is playing. */
    get currentItemMetadata(): Proto.ContentItemMetadata | null {
        return this.currentItem?.metadata ?? null;
    }

    /**
     * Unique identifier for the current artwork, used for change detection.
     * Returns null if no artwork evidence exists.
     */
    get artworkId(): string | null {
        const metadata = this.currentItemMetadata;

        if (!metadata) {
            return null;
        }

        // Only return an ID if there's evidence artwork exists.
        if (!metadata.artworkAvailable && !metadata.artworkURL && !metadata.artworkIdentifier) {
            return null;
        }

        if (metadata.artworkIdentifier) {
            return metadata.artworkIdentifier;
        }

        if (metadata.contentIdentifier) {
            return metadata.contentIdentifier;
        }

        return this.currentItem?.identifier ?? null;
    }

    /**
     * Resolves the best available artwork URL for the current item.
     * Checks metadata artworkURL, remote artworks, and iTunes template URLs in order.
     *
     * @param width - Desired artwork width in pixels (used for template URLs).
     * @param height - Desired artwork height in pixels (-1 for automatic).
     * @returns The artwork URL, or null if no artwork URL is available.
     */
    artworkUrl(width: number = 600, height: number = -1): string | null {
        const metadata = this.currentItemMetadata;

        // Priority 1: artworkURL — direct URL from metadata (known-good).
        if (metadata?.artworkURL) {
            return metadata.artworkURL;
        }

        // Priority 2: remoteArtworks — URL from remote artwork entries.
        const item = this.currentItem;

        if (item?.remoteArtworks.length > 0 && item.remoteArtworks[0].artworkURLString) {
            return item.remoteArtworks[0].artworkURLString;
        }

        // Priority 3: artworkIdentifier — iTunes template URL with {w}x{h} placeholders.
        if (metadata?.artworkIdentifier) {
            try {
                const url = metadata.artworkIdentifier
                    .replace('{w}', String(width < 1 ? 999999 : width))
                    .replace('{h}', String(height < 1 ? 999999 : height))
                    .replace('{c}', 'bb')
                    .replace('{f}', 'png');

                if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                }
            } catch {
                // Template formatting failed.
            }
        }

        return null;
    }

    /** Raw artwork data (image bytes) for the current item, or null if not embedded. */
    get currentItemArtwork(): Uint8Array | null {
        const item = this.currentItem;

        if (!item) {
            return null;
        }

        if (item.artworkData?.byteLength > 0) {
            return item.artworkData;
        }

        if (item.dataArtworks.length > 0 && item.dataArtworks[0].imageData?.byteLength > 0) {
            return item.dataArtworks[0].imageData;
        }

        return null;
    }

    /** Convenience getter for the artwork URL at default dimensions (600px). */
    get currentItemArtworkUrl(): string | null {
        return this.artworkUrl();
    }

    /** Lyrics for the current content item, or null if unavailable. */
    get currentItemLyrics(): Proto.LyricsItem | null {
        return this.currentItem?.lyrics ?? null;
    }

    readonly #identifier: string;
    readonly #displayName: string;
    #nowPlayingInfo: Proto.NowPlayingInfo | null = null;
    #playbackQueue: Proto.PlaybackQueue | null = null;
    #playbackState: Proto.PlaybackState_Enum;
    #playbackStateTimestamp: number = 0;
    #supportedCommands: Proto.CommandInfo[] = [];

    /**
     * Creates a new Player instance.
     *
     * @param identifier - Unique player identifier.
     * @param displayName - Human-readable display name.
     */
    constructor(identifier: string, displayName: string) {
        this.#identifier = identifier;
        this.#displayName = displayName;
        this.#playbackState = Proto.PlaybackState_Enum.Unknown;
    }

    /**
     * Finds a command by its command type in the supported commands list.
     *
     * @param command - The command to look up.
     * @returns The command info, or null if not found.
     */
    findCommand(command: Proto.Command): Proto.CommandInfo | null {
        return this.#supportedCommands.find(c => c.command === command) ?? null;
    }

    /**
     * Checks whether a command is supported and enabled.
     *
     * @param command - The command to check.
     * @returns True if the command is in the supported list and enabled.
     */
    isCommandSupported(command: Proto.Command): boolean {
        const info = this.findCommand(command);
        return info != null && info.enabled !== false;
    }

    /**
     * Updates the now-playing info for this player.
     *
     * @param nowPlayingInfo - The new now-playing info from the Apple TV.
     */
    setNowPlayingInfo(nowPlayingInfo: Proto.NowPlayingInfo): void {
        this.#nowPlayingInfo = nowPlayingInfo;
    }

    /**
     * Updates the playback queue for this player.
     *
     * @param playbackQueue - The new playback queue from the Apple TV.
     */
    setPlaybackQueue(playbackQueue: Proto.PlaybackQueue): void {
        this.#playbackQueue = playbackQueue;
    }

    /**
     * Updates the playback state. Ignores updates with a timestamp older than the current one
     * to prevent stale state from overwriting newer data.
     *
     * @param playbackState - The new playback state.
     * @param playbackStateTimestamp - Timestamp of this state update.
     */
    setPlaybackState(playbackState: Proto.PlaybackState_Enum, playbackStateTimestamp: number): void {
        if (playbackStateTimestamp < this.#playbackStateTimestamp) {
            return;
        }

        this.#playbackState = playbackState;
        this.#playbackStateTimestamp = playbackStateTimestamp;
    }

    /**
     * Replaces the list of supported commands for this player.
     *
     * @param supportedCommands - The new list of supported commands.
     */
    setSupportedCommands(supportedCommands: Proto.CommandInfo[]): void {
        this.#supportedCommands = supportedCommands;
    }

    /**
     * Merges updated content item data into the existing playback queue.
     * Updates metadata, artwork, lyrics, and info fields for the matching item.
     *
     * @param item - The content item with updated fields.
     */
    updateContentItem(item: Proto.ContentItem): void {
        if (!this.#playbackQueue) {
            return;
        }

        const existing = this.#playbackQueue.contentItems.find(i => i.identifier === item.identifier);
        if (!existing) {
            return;
        }

        if (item.metadata != null && existing.metadata != null) {
            for (const [key, value] of Object.entries(item.metadata)) {
                if (value != null) {
                    (existing.metadata as any)[key] = value;
                }
            }
        } else if (item.metadata != null) {
            existing.metadata = item.metadata;
        }

        if (item.artworkData != null) {
            existing.artworkData = item.artworkData;
        }

        if (item.lyrics != null) {
            existing.lyrics = item.lyrics;
        }

        if (item.info != null) {
            existing.info = item.info;
        }
    }
}
