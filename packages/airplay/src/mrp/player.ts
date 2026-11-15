import { type AdditionalMetadata, decodeAdditionalMetadata } from './additionalMetadata';
import * as Proto from './proto';

/** Seconds between the Cocoa epoch (2001-01-01) and the Unix epoch (1970-01-01). */
const COCOA_EPOCH_OFFSET = 978307200;

/** The player the receiver reports when no specific player is active. */
const DEFAULT_PLAYER_ID = 'MediaRemote-DefaultPlayer';

/** The artwork CDN serves HEIC by default, which most browsers cannot show; a `.jpg` extension makes it return JPEG. */
const convertArtworkUrl = (url: string): string => {
    return url.replace(/\.heic(\b|$)/gi, '.jpg');
};

/**
 * Moves an elapsed time from its snapshot to now at the playback rate, never below 0.
 *
 * @param elapsed - Seconds at the moment of the snapshot.
 * @param cocoaTimestamp - Moment of the snapshot, in seconds since the Cocoa epoch.
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
 * One player of a now-playing app; an app can have several, such as picture-in-picture. Tracks
 * the now-playing metadata and playback state, and extrapolates the elapsed time from the Cocoa
 * timestamp and the playback rate.
 */
export class Player {
    /** For example a player path. */
    get identifier(): string {
        return this.#identifier;
    }

    get displayName(): string {
        return this.#displayName;
    }

    /** Whether this is `MediaRemote-DefaultPlayer`, the player of an app without a specific one. */
    get isDefaultPlayer(): boolean {
        return this.#identifier === DEFAULT_PLAYER_ID;
    }

    get nowPlayingInfo(): Proto.NowPlayingInfo | null {
        return this.#nowPlayingInfo;
    }

    get playbackQueue(): Proto.PlaybackQueue | null {
        return this.#playbackQueue;
    }

    get playbackState(): Proto.PlaybackState_Enum {
        return this.#playbackState;
    }

    /** Timestamp of the last playback state update; an older update is ignored. */
    get playbackStateTimestamp(): number {
        return this.#playbackStateTimestamp;
    }

    get supportedCommands(): Proto.CommandInfo[] {
        return this.#supportedCommands;
    }

    get title(): string {
        return this.#nowPlayingInfo?.title || this.currentItemMetadata?.title || '';
    }

    get artist(): string {
        return this.#nowPlayingInfo?.artist || this.currentItemMetadata?.trackArtistName || '';
    }

    get album(): string {
        return this.#nowPlayingInfo?.album || this.currentItemMetadata?.albumName || '';
    }

    get genre(): string {
        return this.currentItemMetadata?.genre || this.#additionalMetadata?.genre || '';
    }

    get seriesName(): string {
        return this.currentItemMetadata?.seriesName || '';
    }

    /** 0 when unknown. */
    get seasonNumber(): number {
        return this.currentItemMetadata?.seasonNumber || this.#additionalMetadata?.seasonNumber || 0;
    }

    /** 0 when unknown. */
    get episodeNumber(): number {
        return this.currentItemMetadata?.episodeNumber || this.#additionalMetadata?.episodeNumber || 0;
    }

    /** Only the Apple TV app sends it, in its archived now-playing info. */
    get episodeTitle(): string {
        return this.#additionalMetadata?.episodeTitle || '';
    }

    /** Localized, for example `12+`. */
    get contentRating(): string {
        return this.currentItemMetadata?.localizedContentRating || this.#additionalMetadata?.contentRating || '';
    }

    get mediaType(): Proto.ContentItemMetadata_MediaType {
        return this.currentItemMetadata?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType;
    }

    /** For example a store ID. */
    get contentIdentifier(): string {
        return this.currentItemMetadata?.contentIdentifier || '';
    }

    /** In seconds. */
    get duration(): number {
        return this.#nowPlayingInfo?.duration || this.currentItemMetadata?.duration || 0;
    }

    /** 1 is normal speed, 0 is paused, 2 is double speed. */
    get playbackRate(): number {
        return this.#nowPlayingInfo?.playbackRate ?? this.currentItemMetadata?.playbackRate ?? 0;
    }

    get isPlaying(): boolean {
        return this.playbackState === Proto.PlaybackState_Enum.Playing;
    }

    /** Read from the info of the ChangeShuffleMode command. */
    get shuffleMode(): Proto.ShuffleMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeShuffleMode);

        return info?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown;
    }

    /** Read from the info of the ChangeRepeatMode command. */
    get repeatMode(): Proto.RepeatMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeRepeatMode);

        return info?.repeatMode ?? Proto.RepeatMode_Enum.Unknown;
    }

    /**
     * Elapsed seconds, extrapolated from the newer timestamp of the now-playing info and the
     * content item. Metadata after a track change can report rate 0 during playback, so the
     * player's rate fills in. A paused player can still report rate 1, so its position stays put.
     */
    get elapsedTime(): number {
        const npi = this.#nowPlayingInfo;
        const meta = this.currentItemMetadata;

        // Devices occasionally send NaN, which would poison the extrapolation.
        const npiValid = Number.isFinite(npi?.elapsedTime) && Number.isFinite(npi?.timestamp) && npi.timestamp !== 0;
        const metaValid = Number.isFinite(meta?.elapsedTime) && Number.isFinite(meta?.elapsedTimeTimestamp) && meta.elapsedTimeTimestamp !== 0;

        if (!npiValid && !metaValid) {
            return npi?.elapsedTime || meta?.elapsedTime || 0;
        }

        // After a track change or a seek, metadata can carry the newer timestamp of the two.
        const newest = metaValid && (!npiValid || meta.elapsedTimeTimestamp > npi.timestamp)
            ? {elapsed: meta.elapsedTime, timestamp: meta.elapsedTimeTimestamp, rate: meta.playbackRate}
            : {elapsed: npi.elapsedTime, timestamp: npi.timestamp, rate: npi.playbackRate};

        if (this.#playbackState !== Proto.PlaybackState_Enum.Playing && this.#playbackState !== Proto.PlaybackState_Enum.Unknown) {
            return newest.elapsed;
        }

        return extrapolateElapsed(newest.elapsed, newest.timestamp, newest.rate || this.playbackRate);
    }

    /** The item at the queue location, or the first item when the location is out of range. */
    get currentItem(): Proto.ContentItem | null {
        if (!this.#playbackQueue || this.#playbackQueue.contentItems.length === 0) {
            return null;
        }

        return this.#playbackQueue.contentItems[this.#playbackQueue.location] ?? this.#playbackQueue.contentItems[0] ?? null;
    }

    get currentItemMetadata(): Proto.ContentItemMetadata | null {
        return this.currentItem?.metadata ?? null;
    }

    /** Changes when the artwork changes; null when the metadata shows no sign of artwork. */
    get artworkId(): string | null {
        const metadata = this.currentItemMetadata;

        if (!metadata) {
            return null;
        }

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
     * The artwork URL of the current item, from the metadata `artworkURL`, the remote artworks or
     * the artwork identifier as a URL template, in that order.
     *
     * @param width - In pixels; only a template uses it.
     * @param height - In pixels; -1 keeps the aspect ratio.
     */
    artworkUrl(width: number = 600, height: number = -1): string | null {
        const metadata = this.currentItemMetadata;

        if (metadata?.artworkURL) {
            return convertArtworkUrl(metadata.artworkURL);
        }

        const item = this.currentItem;

        if (item?.remoteArtworks.length > 0 && item.remoteArtworks[0].artworkURLString) {
            return convertArtworkUrl(item.remoteArtworks[0].artworkURLString);
        }

        if (metadata?.artworkIdentifier) {
            try {
                const url = metadata.artworkIdentifier
                    .replace('{w}', String(width < 1 ? 999999 : width))
                    .replace('{h}', String(height < 1 ? 999999 : height))
                    .replace('{c}', 'bb')
                    .replace('{f}', 'jpg');

                if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                }
            } catch {
            }
        }

        return null;
    }

    /** Image bytes embedded in the current item. */
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

    /** The artwork URL at 600 pixels wide. */
    get currentItemArtworkUrl(): string | null {
        return this.artworkUrl();
    }

    get currentItemLyrics(): Proto.LyricsItem | null {
        return this.currentItem?.lyrics ?? null;
    }

    get #additionalMetadata(): AdditionalMetadata | null {
        return decodeAdditionalMetadata(this.currentItemMetadata?.nowPlayingInfoData);
    }

    readonly #identifier: string;
    readonly #displayName: string;
    #nowPlayingInfo: Proto.NowPlayingInfo | null = null;
    #playbackQueue: Proto.PlaybackQueue | null = null;
    #playbackState: Proto.PlaybackState_Enum;
    #playbackStateTimestamp: number = 0;
    #supportedCommands: Proto.CommandInfo[] = [];

    constructor(identifier: string, displayName: string) {
        this.#identifier = identifier;
        this.#displayName = displayName;
        this.#playbackState = Proto.PlaybackState_Enum.Unknown;
    }

    findCommand(command: Proto.Command): Proto.CommandInfo | null {
        return this.#supportedCommands.find(c => c.command === command) ?? null;
    }

    /** Whether the command is in the list and not disabled. */
    isCommandSupported(command: Proto.Command): boolean {
        const info = this.findCommand(command);

        return info != null && info.enabled !== false;
    }

    setNowPlayingInfo(nowPlayingInfo: Proto.NowPlayingInfo): void {
        this.#nowPlayingInfo = nowPlayingInfo;
    }

    setPlaybackQueue(playbackQueue: Proto.PlaybackQueue): void {
        this.#playbackQueue = playbackQueue;
    }

    /** Ignores an update with a timestamp older than the current one, so stale state never wins. */
    setPlaybackState(playbackState: Proto.PlaybackState_Enum, playbackStateTimestamp: number): void {
        if (playbackStateTimestamp < this.#playbackStateTimestamp) {
            return;
        }

        this.#playbackState = playbackState;
        this.#playbackStateTimestamp = playbackStateTimestamp;
    }

    setSupportedCommands(supportedCommands: Proto.CommandInfo[]): void {
        this.#supportedCommands = supportedCommands;
    }

    /** Merges the fields an update carries into the queue item with the same identifier. */
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
                if (value != null && !key.startsWith('$')) {
                    (existing.metadata as any)[key] = value;
                }
            }
        } else if (item.metadata != null) {
            existing.metadata = item.metadata;
        }

        if (item.artworkData != null) {
            existing.artworkData = item.artworkData;
        }

        if (item.dataArtworks.length > 0) {
            existing.dataArtworks = item.dataArtworks;
        }

        if (item.remoteArtworks.length > 0) {
            existing.remoteArtworks = item.remoteArtworks;
        }

        // Protobuf creates empty repeated fields even when an update only contains metadata.
        if (item.animatedArtworks.length > 0) {
            existing.animatedArtworks = item.animatedArtworks;
        }

        if (item.availableAnimatedArtworkFormats.length > 0) {
            existing.availableAnimatedArtworkFormats = item.availableAnimatedArtworkFormats;
        }

        if (item.animatedArtworkPreviewFrames.length > 0) {
            existing.animatedArtworkPreviewFrames = item.animatedArtworkPreviewFrames;
        }

        if (item.lyrics != null) {
            existing.lyrics = item.lyrics;
        }

        if (item.info != null) {
            existing.info = item.info;
        }
    }
}
