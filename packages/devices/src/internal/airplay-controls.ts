import type { AnimatedArtworkResult, ArtworkResult, MediaRemote, MediaRemoteState, Proto } from '@corewire/airplay/mrp';
import { fetchAppleMusicArtwork } from './apple-music-artwork';

/** The MediaRemote of the current session; throws when there is none. */
type RemoteAccess = () => MediaRemote;

/**
 * The remote control of a device: the keys, the playback commands and text input of the
 * current {@link MediaRemote}, as one object that outlives its sessions.
 */
export class AirPlayRemote {
    readonly #remote: RemoteAccess;

    constructor(remote: RemoteAccess) {
        this.#remote = remote;
    }

    async up(): Promise<void> {
        await this.#remote().hid.up();
    }

    async down(): Promise<void> {
        await this.#remote().hid.down();
    }

    async left(): Promise<void> {
        await this.#remote().hid.left();
    }

    async right(): Promise<void> {
        await this.#remote().hid.right();
    }

    async menu(): Promise<void> {
        await this.#remote().hid.menu();
    }

    async select(): Promise<void> {
        await this.#remote().hid.select();
    }

    async home(): Promise<void> {
        await this.#remote().hid.home();
    }

    async suspend(): Promise<void> {
        await this.#remote().hid.suspend();
    }

    async wake(): Promise<void> {
        await this.#remote().hid.wake();
    }

    async play(): Promise<void> {
        await this.#remote().hid.play();
    }

    async pause(): Promise<void> {
        await this.#remote().hid.pause();
    }

    async playPause(): Promise<void> {
        await this.#remote().hid.playPause();
    }

    async stop(): Promise<void> {
        await this.#remote().hid.stop();
    }

    async next(): Promise<void> {
        await this.#remote().hid.next();
    }

    async previous(): Promise<void> {
        await this.#remote().hid.previous();
    }

    async volumeUp(): Promise<void> {
        await this.#remote().hid.volumeUp();
    }

    async volumeDown(): Promise<void> {
        await this.#remote().hid.volumeDown();
    }

    async mute(): Promise<void> {
        await this.#remote().hid.mute();
    }

    async topMenu(): Promise<void> {
        await this.#remote().hid.topMenu();
    }

    async channelUp(): Promise<void> {
        await this.#remote().hid.channelUp();
    }

    async channelDown(): Promise<void> {
        await this.#remote().hid.channelDown();
    }

    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.#remote().hid.doublePress(usePage, usage);
    }

    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        await this.#remote().hid.longPress(usePage, usage, duration);
    }

    async pressAndRelease(usePage: number, usage: number): Promise<void> {
        await this.#remote().hid.press(usePage, usage);
    }

    async commandPlay(): Promise<void> {
        await this.#remote().commands.play();
    }

    async commandPause(): Promise<void> {
        await this.#remote().commands.pause();
    }

    async commandTogglePlayPause(): Promise<void> {
        await this.#remote().commands.togglePlayPause();
    }

    async commandStop(): Promise<void> {
        await this.#remote().commands.stop();
    }

    async commandNextTrack(): Promise<void> {
        await this.#remote().commands.nextTrack();
    }

    async commandPreviousTrack(): Promise<void> {
        await this.#remote().commands.previousTrack();
    }

    async commandSkipForward(interval: number = 15): Promise<void> {
        await this.#remote().commands.skipForward(interval);
    }

    async commandSkipBackward(interval: number = 15): Promise<void> {
        await this.#remote().commands.skipBackward(interval);
    }

    async commandSeekToPosition(position: number): Promise<void> {
        await this.#remote().commands.seekToPosition(position);
    }

    async commandSetShuffleMode(mode: Proto.ShuffleMode_Enum): Promise<void> {
        await this.#remote().commands.setShuffleMode(mode);
    }

    async commandSetRepeatMode(mode: Proto.RepeatMode_Enum): Promise<void> {
        await this.#remote().commands.setRepeatMode(mode);
    }

    async commandChangePlaybackRate(rate: number): Promise<void> {
        await this.#remote().commands.changePlaybackRate(rate);
    }

    async commandAdvanceShuffleMode(): Promise<void> {
        await this.#remote().commands.advanceShuffleMode();
    }

    async commandAdvanceRepeatMode(): Promise<void> {
        await this.#remote().commands.advanceRepeatMode();
    }

    async commandBeginFastForward(): Promise<void> {
        await this.#remote().commands.beginFastForward();
    }

    async commandEndFastForward(): Promise<void> {
        await this.#remote().commands.endFastForward();
    }

    async commandBeginRewind(): Promise<void> {
        await this.#remote().commands.beginRewind();
    }

    async commandEndRewind(): Promise<void> {
        await this.#remote().commands.endRewind();
    }

    async commandNextChapter(): Promise<void> {
        await this.#remote().commands.nextChapter();
    }

    async commandPreviousChapter(): Promise<void> {
        await this.#remote().commands.previousChapter();
    }

    async commandLikeTrack(): Promise<void> {
        await this.#remote().commands.likeTrack();
    }

    async commandDislikeTrack(): Promise<void> {
        await this.#remote().commands.dislikeTrack();
    }

    async commandBookmarkTrack(): Promise<void> {
        await this.#remote().commands.bookmarkTrack();
    }

    async commandAddNowPlayingItemToLibrary(): Promise<void> {
        await this.#remote().commands.addNowPlayingItemToLibrary();
    }

    async commandSetSleepTimer(seconds: number, stopMode: number = 0): Promise<void> {
        await this.#remote().commands.setSleepTimer(seconds, stopMode);
    }

    async textSet(text: string): Promise<void> {
        await this.#remote().keyboard.set(text);
    }

    async textAppend(text: string): Promise<void> {
        await this.#remote().keyboard.append(text);
    }

    async textClear(): Promise<void> {
        await this.#remote().keyboard.clear();
    }

    async getKeyboardSession(): Promise<void> {
        await this.#remote().keyboard.getSession();
    }
}

/** The volume of the current {@link MediaRemote}, as one object that outlives its sessions. */
export class AirPlayVolume {
    readonly #remote: RemoteAccess;

    constructor(remote: RemoteAccess) {
        this.#remote = remote;
    }

    async down(): Promise<void> {
        await this.#remote().volume.down();
    }

    async up(): Promise<void> {
        await this.#remote().volume.up();
    }

    async get(): Promise<number> {
        return await this.#remote().volume.get();
    }

    async set(volume: number): Promise<void> {
        await this.#remote().volume.set(volume);
    }

    async mute(): Promise<void> {
        await this.#remote().volume.mute();
    }

    async unmute(): Promise<void> {
        await this.#remote().volume.unmute();
    }

    async toggleMute(): Promise<void> {
        await this.#remote().volume.toggleMute();
    }

    async setForDevice(outputDeviceUID: string, volume: number): Promise<void> {
        await this.#remote().volume.setForDevice(outputDeviceUID, volume);
    }

    async getForDevice(outputDeviceUID: string): Promise<number> {
        return await this.#remote().volume.getForDevice(outputDeviceUID);
    }

    async muteDevice(outputDeviceUID: string): Promise<void> {
        await this.#remote().volume.muteDevice(outputDeviceUID);
    }

    async unmuteDevice(outputDeviceUID: string): Promise<void> {
        await this.#remote().volume.unmuteDevice(outputDeviceUID);
    }

    async adjust(adjustment: Proto.AdjustVolumeMessage_Adjustment, outputDeviceUID?: string): Promise<void> {
        await this.#remote().volume.adjust(adjustment, outputDeviceUID);
    }

    async fade(targetVolume: number, durationMs: number): Promise<void> {
        await this.#remote().volume.fade(targetVolume, durationMs);
    }
}

/**
 * The artwork of a device: what the current {@link MediaRemote} delivers, plus the opt-in lookup
 * of animated artwork in the Apple Music catalog. Without a session there is no artwork.
 */
export class AirPlayArtwork {
    readonly #remote: () => MediaRemote | undefined;
    readonly #state: MediaRemoteState;

    constructor(remote: () => MediaRemote | undefined, state: MediaRemoteState) {
        this.#remote = remote;
        this.#state = state;
    }

    async get(width: number = 600, height: number = -1): Promise<ArtworkResult | null> {
        return await this.#remote()?.artwork.get(width, height) ?? null;
    }

    async getAnimated(width: number = 600, height: number = -1): Promise<AnimatedArtworkResult[]> {
        return await this.#remote()?.artwork.getAnimated(width, height) ?? [];
    }

    /** Opt-in catalog lookup; unlike getAnimated(), this contacts music.apple.com. */
    async getAnimatedFromCatalog(storefront: string = 'us'): Promise<AnimatedArtworkResult[]> {
        const player = this.#state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;
        const albumId = player?.currentItemMetadata?.iTunesStoreAlbumIdentifier;

        if (!identifier || !albumId) {
            return [];
        }

        const results = await fetchAppleMusicArtwork(albumId.toString(), storefront);

        return this.#state.nowPlayingClient?.activePlayer === player && player.currentItem?.identifier === identifier ? results : [];
    }

    /** Forgets the cached artwork, so the next {@link get} looks again. */
    clear(): void {
        this.#remote()?.artwork.clear();
    }
}
