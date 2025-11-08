import { Proto } from '@basmilius/apple-airplay';

export default class Client {
    get bundleIdentifier(): string {
        return this.#bundleIdentifier;
    }

    get displayName(): string {
        return this.#displayName;
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

    readonly #bundleIdentifier: string;
    readonly #displayName: string;
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

    setPlaybackQueue(playbackQueue: Proto.PlaybackQueue): void {
        this.#playbackQueue = playbackQueue;
    }

    setPlaybackState(playbackState: Proto.PlaybackState_Enum, playbackStateTimestamp: number): void {
        this.#playbackState = playbackState;
        this.#playbackStateTimestamp = playbackStateTimestamp;
    }

    setSupportedCommands(supportedCommands: Proto.CommandInfo[]): void {
        this.#supportedCommands = supportedCommands;
    }
}
