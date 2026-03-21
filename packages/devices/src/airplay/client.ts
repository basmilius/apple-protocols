import { Proto } from '@basmilius/apple-airplay';
import { merge } from 'lodash-es';

const COCOA_EPOCH_OFFSET = 978307200;

const extrapolateElapsed = (elapsed: number, cocoaTimestamp: number, rate: number, isPlaying: boolean): number => {
    if (!rate || !isPlaying) {
        return elapsed;
    }

    const timestampUnix = cocoaTimestamp + COCOA_EPOCH_OFFSET;
    const delta = (Date.now() / 1000 - timestampUnix) * rate;

    return Math.max(0, elapsed + delta);
};

export default class Client {
    get bundleIdentifier(): string {
        return this.#bundleIdentifier;
    }

    get displayName(): string {
        return this.#displayName;
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

    get duration(): number {
        return this.#nowPlayingInfo?.duration || this.currentItemMetadata?.duration || 0;
    }

    get playbackRate(): number {
        return this.#nowPlayingInfo?.playbackRate ?? this.currentItemMetadata?.playbackRate ?? 0;
    }

    get isPlaying(): boolean {
        return this.#playbackState === Proto.PlaybackState_Enum.Playing;
    }

    get shuffleMode(): Proto.ShuffleMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeShuffleMode);

        return info?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown;
    }

    get repeatMode(): Proto.RepeatMode_Enum {
        const info = this.#supportedCommands.find(c => c.command === Proto.Command.ChangeRepeatMode);

        return info?.repeatMode ?? Proto.RepeatMode_Enum.Unknown;
    }

    get elapsedTime(): number {
        const npi = this.#nowPlayingInfo;
        const meta = this.currentItemMetadata;

        // Prefer NowPlayingInfo — it's the live ticker and updates on replay
        if (npi?.elapsedTime != null && npi.timestamp) {
            return extrapolateElapsed(npi.elapsedTime, npi.timestamp, npi.playbackRate, this.isPlaying);
        }

        // Fall back to queue item metadata
        if (meta?.elapsedTime != null && meta.elapsedTimeTimestamp) {
            return extrapolateElapsed(meta.elapsedTime, meta.elapsedTimeTimestamp, meta.playbackRate, this.isPlaying);
        }

        return npi?.elapsedTime || meta?.elapsedTime || 0;
    }

    get currentItem(): Proto.ContentItem | null {
        if (!this.#playbackQueue || this.#playbackQueue.contentItems.length === 0) {
            return null;
        }

        return this.#playbackQueue.contentItems[this.#playbackQueue.location] ?? this.#playbackQueue.contentItems[0] ?? null;
    }

    get currentItemMetadata(): Proto.ContentItemMetadata | null {
        return this.currentItem?.metadata ?? null;
    }

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

    get currentItemArtworkUrl(): string | null {
        const metadata = this.currentItemMetadata;

        if (metadata?.artworkURL) {
            return metadata.artworkURL;
        }

        const item = this.currentItem;

        if (item?.remoteArtworks.length > 0 && item.remoteArtworks[0].artworkURLString) {
            return item.remoteArtworks[0].artworkURLString;
        }

        return null;
    }

    get currentItemLyrics(): Proto.LyricsItem | null {
        return this.currentItem?.lyrics ?? null;
    }

    readonly #bundleIdentifier: string;
    readonly #displayName: string;
    #nowPlayingInfo: Proto.NowPlayingInfo | null = null;
    #playbackQueue: Proto.PlaybackQueue | null = null;
    #playbackState: Proto.PlaybackState_Enum;
    #playbackStateTimestamp: number;
    #supportedCommands: Proto.CommandInfo[] = [];

    constructor(bundleIdentifier: string, displayName: string) {
        this.#bundleIdentifier = bundleIdentifier;
        this.#displayName = displayName;
        this.#playbackState = Proto.PlaybackState_Enum.Unknown;
        this.#supportedCommands = [];
    }

    isCommandSupported(command: Proto.Command): boolean {
        return this.#supportedCommands.some(c => c.command === command);
    }

    setNowPlayingInfo(nowPlayingInfo: Proto.NowPlayingInfo): void {
        this.#nowPlayingInfo = nowPlayingInfo;
    }

    setPlaybackQueue(playbackQueue: Proto.PlaybackQueue): void {
        this.#playbackQueue = playbackQueue;
    }

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

    updateContentItem(item: Proto.ContentItem): void {
        if (!this.#playbackQueue) {
            return;
        }

        const index = this.#playbackQueue.contentItems.findIndex(i => i.identifier === item.identifier);
        if (index === -1) {
            return;
        }

        this.#playbackQueue.contentItems[index] = merge(
            item,
            this.#playbackQueue.contentItems[index]
        );
    }
}
