import { Proto } from '@basmilius/apple-airplay';
import { AirPlayPlayer, DEFAULT_PLAYER_ID } from './airplay-player';

/**
 * Represents a now-playing app (client) on the Apple TV.
 * Each client is identified by its bundle identifier and can contain multiple players.
 * Proxies now-playing getters to the active player, merging player-specific and
 * default supported commands.
 */
export class AirPlayClient {
    /**
     * Bundle identifier of the app (e.g. "com.apple.TVMusic").
     */
    get bundleIdentifier(): string {
        return this.#bundleIdentifier;
    }

    /**
     * Human-readable display name of the app.
     */
    get displayName(): string {
        return this.#displayName;
    }

    /**
     * Map of all known players for this client, keyed by player identifier.
     */
    get players(): Map<string, AirPlayPlayer> {
        return this.#players;
    }

    /**
     * The currently active player, or null if none is active. Falls back to the default player.
     */
    get activePlayer(): AirPlayPlayer | null {
        return this.#players.get(this.#activePlayerId ?? DEFAULT_PLAYER_ID) ?? null;
    }

    /**
     * Now-playing info from the active player, or null.
     */
    get nowPlayingInfo(): Proto.NowPlayingInfo | null {
        return this.activePlayer?.nowPlayingInfo ?? null;
    }

    /**
     * Playback queue from the active player, or null.
     */
    get playbackQueue(): Proto.PlaybackQueue | null {
        return this.activePlayer?.playbackQueue ?? null;
    }

    /**
     * Playback state from the active player, or Unknown.
     */
    get playbackState(): Proto.PlaybackState_Enum {
        return this.activePlayer?.playbackState ?? Proto.PlaybackState_Enum.Unknown;
    }

    /**
     * Timestamp of the last playback state update from the active player.
     */
    get playbackStateTimestamp(): number {
        return this.activePlayer?.playbackStateTimestamp ?? -1;
    }

    /**
     * Merged list of supported commands from the active player and client defaults.
     * Player commands take precedence; default commands are appended if not already present.
     */
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

    /**
     * Current track title from the active player.
     */
    get title(): string {
        return this.activePlayer?.title ?? '';
    }

    /**
     * Current track artist from the active player.
     */
    get artist(): string {
        return this.activePlayer?.artist ?? '';
    }

    /**
     * Current track album from the active player.
     */
    get album(): string {
        return this.activePlayer?.album ?? '';
    }

    /**
     * Genre of the current content from the active player.
     */
    get genre(): string {
        return this.activePlayer?.genre ?? '';
    }

    /**
     * Series name for TV show content from the active player.
     */
    get seriesName(): string {
        return this.activePlayer?.seriesName ?? '';
    }

    /**
     * Season number for TV show content from the active player.
     */
    get seasonNumber(): number {
        return this.activePlayer?.seasonNumber ?? 0;
    }

    /**
     * Episode number for TV show content from the active player.
     */
    get episodeNumber(): number {
        return this.activePlayer?.episodeNumber ?? 0;
    }

    /**
     * Media type of the current content from the active player.
     */
    get mediaType(): Proto.ContentItemMetadata_MediaType {
        return this.activePlayer?.mediaType ?? Proto.ContentItemMetadata_MediaType.UnknownMediaType;
    }

    /**
     * Content identifier of the current item from the active player.
     */
    get contentIdentifier(): string {
        return this.activePlayer?.contentIdentifier ?? '';
    }

    /**
     * Duration of the current track in seconds from the active player.
     */
    get duration(): number {
        return this.activePlayer?.duration ?? 0;
    }

    /**
     * Playback rate from the active player (1.0 = normal, 0 = paused).
     */
    get playbackRate(): number {
        return this.activePlayer?.playbackRate ?? 0;
    }

    /**
     * Whether the active player is currently playing.
     */
    get isPlaying(): boolean {
        return this.activePlayer?.isPlaying ?? false;
    }

    /**
     * Current shuffle mode from the active player.
     */
    get shuffleMode(): Proto.ShuffleMode_Enum {
        return this.activePlayer?.shuffleMode ?? Proto.ShuffleMode_Enum.Unknown;
    }

    /**
     * Current repeat mode from the active player.
     */
    get repeatMode(): Proto.RepeatMode_Enum {
        return this.activePlayer?.repeatMode ?? Proto.RepeatMode_Enum.Unknown;
    }

    /**
     * Extrapolated elapsed time in seconds from the active player.
     */
    get elapsedTime(): number {
        return this.activePlayer?.elapsedTime ?? 0;
    }

    /**
     * Artwork identifier for change detection from the active player.
     */
    get artworkId(): string | null {
        return this.activePlayer?.artworkId ?? null;
    }

    /**
     * Resolves the best available artwork URL from the active player.
     *
     * @param width - Desired artwork width in pixels.
     * @param height - Desired artwork height in pixels (-1 for automatic).
     * @returns The artwork URL, or null if unavailable.
     */
    artworkUrl(width: number = 600, height: number = -1): string | null {
        return this.activePlayer?.artworkUrl(width, height) ?? null;
    }

    /**
     * Current content item from the active player's playback queue.
     */
    get currentItem(): Proto.ContentItem | null {
        return this.activePlayer?.currentItem ?? null;
    }

    /**
     * Metadata of the current content item from the active player.
     */
    get currentItemMetadata(): Proto.ContentItemMetadata | null {
        return this.activePlayer?.currentItemMetadata ?? null;
    }

    /**
     * Raw artwork data (image bytes) from the active player.
     */
    get currentItemArtwork(): Uint8Array | null {
        return this.activePlayer?.currentItemArtwork ?? null;
    }

    /**
     * Artwork URL at default dimensions from the active player.
     */
    get currentItemArtworkUrl(): string | null {
        return this.activePlayer?.currentItemArtworkUrl ?? null;
    }

    /**
     * Lyrics for the current content item from the active player.
     */
    get currentItemLyrics(): Proto.LyricsItem | null {
        return this.activePlayer?.currentItemLyrics ?? null;
    }

    readonly #bundleIdentifier: string;
    #displayName: string;
    #players: Map<string, AirPlayPlayer> = new Map();
    #activePlayerId: string | null = null;
    #defaultSupportedCommands: Proto.CommandInfo[] = [];

    /**
     * Creates a new Client instance.
     *
     * @param bundleIdentifier - Bundle identifier of the app.
     * @param displayName - Human-readable app name.
     */
    constructor(bundleIdentifier: string, displayName: string) {
        this.#bundleIdentifier = bundleIdentifier;
        this.#displayName = displayName;
    }

    /**
     * Gets an existing player or creates a new one if it does not exist.
     *
     * @param identifier - Unique player identifier.
     * @param displayName - Human-readable player name (defaults to identifier).
     * @returns The existing or newly created Player.
     */
    getOrCreatePlayer(identifier: string, displayName?: string): AirPlayPlayer {
        let player = this.#players.get(identifier);

        if (!player) {
            player = new AirPlayPlayer(identifier, displayName ?? identifier);
            this.#players.set(identifier, player);
        }

        return player;
    }

    /**
     * Sets the active player by identifier.
     *
     * @param identifier - Identifier of the player to activate.
     */
    setActivePlayer(identifier: string): void {
        this.#activePlayerId = identifier;
    }

    /**
     * Removes a player from this client. If the removed player was active,
     * the active player is reset to null (falling back to the default player).
     *
     * @param identifier - Identifier of the player to remove.
     */
    removePlayer(identifier: string): void {
        this.#players.delete(identifier);

        if (this.#activePlayerId === identifier) {
            this.#activePlayerId = null;
        }
    }

    /**
     * Sets the default supported commands for this client. These are used as
     * fallback when the active player has no commands of its own.
     *
     * @param supportedCommands - The default command list.
     */
    setDefaultSupportedCommands(supportedCommands: Proto.CommandInfo[]): void {
        this.#defaultSupportedCommands = supportedCommands;
    }

    /**
     * Finds a command by type, checking the active player first,
     * then falling back to the default supported commands.
     *
     * @param command - The command to look up.
     * @returns The command info, or null if not found.
     */
    findCommand(command: Proto.Command): Proto.CommandInfo | null {
        const playerCmd = this.activePlayer?.findCommand(command) ?? null;

        if (playerCmd) {
            return playerCmd;
        }

        return this.#defaultSupportedCommands.find(c => c.command === command) ?? null;
    }

    /**
     * Checks whether a command is supported and enabled, checking both
     * the active player and default commands.
     *
     * @param command - The command to check.
     * @returns True if the command is supported and enabled.
     */
    isCommandSupported(command: Proto.Command): boolean {
        const info = this.findCommand(command);
        return info != null && info.enabled !== false;
    }

    /**
     * Updates the display name for this client.
     *
     * @param displayName - The new display name.
     */
    updateDisplayName(displayName: string): void {
        this.#displayName = displayName;
    }
}
