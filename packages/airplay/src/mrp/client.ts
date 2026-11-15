import { DEFAULT_PLAYER_ID, Player } from './player';
import * as Proto from './proto';

/**
 * A now-playing app on the receiver, keyed by bundle identifier, with one or more players. The
 * now-playing getters read from the active player.
 */
export class Client {
    /** The bundle identifier of the app, such as `com.apple.TVMusic`. */
    get bundleIdentifier(): string {
        return this.#bundleIdentifier;
    }

    get displayName(): string {
        return this.#displayName;
    }

    /** The players of this app, keyed by player identifier. */
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

    /** The timestamp of the last playback state update, or -1 without an active player. */
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

        const playerCommandSet = new Set(playerCommands.map(commandInfo => commandInfo.command));
        const merged = [...playerCommands];

        for (const commandInfo of this.#defaultSupportedCommands) {
            if (!playerCommandSet.has(commandInfo.command)) {
                merged.push(commandInfo);
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

    /** The duration of the current item in seconds. */
    get duration(): number {
        return this.activePlayer?.duration ?? 0;
    }

    /** The playback rate, where 1 is normal speed and 0 is paused. */
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

    /** The elapsed time in seconds, extrapolated to now. */
    get elapsedTime(): number {
        return this.activePlayer?.elapsedTime ?? 0;
    }

    /** An identifier that changes with the artwork, or null without artwork. */
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

    /** The image bytes embedded in the current item, or null. */
    get currentItemArtwork(): Uint8Array | null {
        return this.activePlayer?.currentItemArtwork ?? null;
    }

    /** The artwork URL at 600 pixels wide, or null. */
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

    /**
     * Returns the player with this identifier, created when it does not exist yet.
     *
     * @param displayName - The name of a new player; the identifier when omitted.
     */
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

    /** Removes a player; removing the active one makes the default player active. */
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

    /** Finds a command in the list of the active player first, then in the defaults. */
    findCommand(command: Proto.Command): Proto.CommandInfo | null {
        const playerCommand = this.activePlayer?.findCommand(command) ?? null;

        if (playerCommand) {
            return playerCommand;
        }

        return this.#defaultSupportedCommands.find(commandInfo => commandInfo.command === command) ?? null;
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
