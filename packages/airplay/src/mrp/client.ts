import { DEFAULT_PLAYER_ID, Player } from './player';
import * as Proto from './proto';

/**
 * A now-playing app on the receiver, keyed by bundle identifier, with one or more players. The
 * now-playing getters read from the active player.
 */
export class Client {
    /** For example `com.apple.TVMusic`. */
    get bundleIdentifier(): string {
        return this.#bundleIdentifier;
    }

    get displayName(): string {
        return this.#displayName;
    }

    /** Keyed by player identifier. */
    get players(): Map<string, Player> {
        return this.#players;
    }

    /** The player set active, or the default player when none is set; null when that player does not exist. */
    get activePlayer(): Player | null {
        return this.#players.get(this.#activePlayerId ?? DEFAULT_PLAYER_ID) ?? null;
    }

    get nowPlayingInfo(): Proto.NowPlayingInfo | null {
        return this.activePlayer?.nowPlayingInfo ?? null;
    }

    get playbackQueue(): Proto.PlaybackQueue | null {
        return this.activePlayer?.playbackQueue ?? null;
    }

    get playbackState(): Proto.PlaybackState_Enum {
        return this.activePlayer?.playbackState ?? Proto.PlaybackState_Enum.Unknown;
    }

    /** Timestamp of the last playback state update; -1 without an active player. */
    get playbackStateTimestamp(): number {
        return this.activePlayer?.playbackStateTimestamp ?? -1;
    }

    /** The commands of the active player, followed by the client defaults it does not list. */
    get supportedCommands(): Proto.CommandInfo[] {
        const playerCommands = this.activePlayer?.supportedCommands ?? [];

        if (playerCommands.length === 0) {
            return this.#defaultSupportedCommands;
        }

        if (this.#defaultSupportedCommands.length === 0) {
            return playerCommands;
        }

        const playerCommandSet = new Set(playerCommands.map(c => c.command));
        const merged = [...playerCommands];

        for (const cmd of this.#defaultSupportedCommands) {
            if (!playerCommandSet.has(cmd.command)) {
                merged.push(cmd);
            }
        }

        return merged;
    }

    get title(): string {
        return this.activePlayer?.title ?? '';
    }

    get artist(): string {
        return this.activePlayer?.artist ?? '';
    }

    get album(): string {
        return this.activePlayer?.album ?? '';
    }

    get genre(): string {
        return this.activePlayer?.genre ?? '';
    }

    get seriesName(): string {
        return this.activePlayer?.seriesName ?? '';
    }

    get seasonNumber(): number {
        return this.activePlayer?.seasonNumber ?? 0;
    }

    get episodeNumber(): number {
        return this.activePlayer?.episodeNumber ?? 0;
    }

    get episodeTitle(): string {
        return this.activePlayer?.episodeTitle ?? '';
    }

    get contentRating(): string {
        return this.activePlayer?.contentRating ?? '';
    }

    get mediaType(): Proto.ContentItemMetadata_MediaType {
        return this.activePlayer?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType;
    }

    get contentIdentifier(): string {
        return this.activePlayer?.contentIdentifier ?? '';
    }

    /** In seconds. */
    get duration(): number {
        return this.activePlayer?.duration ?? 0;
    }

    /** 1 is normal speed, 0 is paused. */
    get playbackRate(): number {
        return this.activePlayer?.playbackRate ?? 0;
    }

    get isPlaying(): boolean {
        return this.activePlayer?.isPlaying ?? false;
    }

    get shuffleMode(): Proto.ShuffleMode_Enum {
        return this.activePlayer?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown;
    }

    get repeatMode(): Proto.RepeatMode_Enum {
        return this.activePlayer?.repeatMode ?? Proto.RepeatMode_Enum.Unknown;
    }

    /** Elapsed seconds, extrapolated to now. */
    get elapsedTime(): number {
        return this.activePlayer?.elapsedTime ?? 0;
    }

    /** Changes when the artwork changes; null without artwork. */
    get artworkId(): string | null {
        return this.activePlayer?.artworkId ?? null;
    }

    /**
     * The artwork URL of the current item; see {@link Player.artworkUrl}.
     *
     * @param width - In pixels.
     * @param height - In pixels; -1 keeps the aspect ratio.
     */
    artworkUrl(width: number = 600, height: number = -1): string | null {
        return this.activePlayer?.artworkUrl(width, height) ?? null;
    }

    get currentItem(): Proto.ContentItem | null {
        return this.activePlayer?.currentItem ?? null;
    }

    get currentItemMetadata(): Proto.ContentItemMetadata | null {
        return this.activePlayer?.currentItemMetadata ?? null;
    }

    /** Image bytes embedded in the current item. */
    get currentItemArtwork(): Uint8Array | null {
        return this.activePlayer?.currentItemArtwork ?? null;
    }

    /** The artwork URL at 600 pixels wide. */
    get currentItemArtworkUrl(): string | null {
        return this.activePlayer?.currentItemArtworkUrl ?? null;
    }

    get currentItemLyrics(): Proto.LyricsItem | null {
        return this.activePlayer?.currentItemLyrics ?? null;
    }

    readonly #bundleIdentifier: string;
    #displayName: string;
    #players: Map<string, Player> = new Map();
    #activePlayerId: string | null = null;
    #defaultSupportedCommands: Proto.CommandInfo[] = [];

    constructor(bundleIdentifier: string, displayName: string) {
        this.#bundleIdentifier = bundleIdentifier;
        this.#displayName = displayName;
    }

    /** @param displayName - The identifier when omitted, for a new player. */
    getOrCreatePlayer(identifier: string, displayName?: string): Player {
        let player = this.#players.get(identifier);

        if (!player) {
            player = new Player(identifier, displayName ?? identifier);
            this.#players.set(identifier, player);
        }

        return player;
    }

    setActivePlayer(identifier: string): void {
        this.#activePlayerId = identifier;
    }

    /** Removing the active player makes the default player active. */
    removePlayer(identifier: string): void {
        this.#players.delete(identifier);

        if (this.#activePlayerId === identifier) {
            this.#activePlayerId = null;
        }
    }

    /** Sets the commands that complete the list of the active player. */
    setDefaultSupportedCommands(supportedCommands: Proto.CommandInfo[]): void {
        this.#defaultSupportedCommands = supportedCommands;
    }

    /** Looks in the commands of the active player first, then in the defaults. */
    findCommand(command: Proto.Command): Proto.CommandInfo | null {
        const playerCmd = this.activePlayer?.findCommand(command) ?? null;

        if (playerCmd) {
            return playerCmd;
        }

        return this.#defaultSupportedCommands.find(c => c.command === command) ?? null;
    }

    /** Whether {@link findCommand} finds the command and it is not disabled. */
    isCommandSupported(command: Proto.Command): boolean {
        const info = this.findCommand(command);

        return info != null && info.enabled !== false;
    }

    updateDisplayName(displayName: string): void {
        this.#displayName = displayName;
    }
}
