import type { AirPlayManager } from '../internal';

/**
 * Remote controller for Apple devices.
 * Provides all HID-based keys (navigation, media, volume, power),
 * touch/swipe gestures, and low-level HID primitives.
 */
export class RemoteController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    // --- Navigation (Generic Desktop page 0x01) ---

    async up(): Promise<void> {
        await this.#airplay.remote.up();
    }

    async down(): Promise<void> {
        await this.#airplay.remote.down();
    }

    async left(): Promise<void> {
        await this.#airplay.remote.left();
    }

    async right(): Promise<void> {
        await this.#airplay.remote.right();
    }

    async select(): Promise<void> {
        await this.#airplay.remote.select();
    }

    async menu(): Promise<void> {
        await this.#airplay.remote.menu();
    }

    async home(): Promise<void> {
        await this.#airplay.remote.home();
    }

    async topMenu(): Promise<void> {
        await this.#airplay.remote.topMenu();
    }

    // --- Media keys (Consumer page 0x0C) ---

    async play(): Promise<void> {
        await this.#airplay.remote.play();
    }

    async pause(): Promise<void> {
        await this.#airplay.remote.pause();
    }

    async playPause(): Promise<void> {
        await this.#airplay.remote.playPause();
    }

    async stop(): Promise<void> {
        await this.#airplay.remote.stop();
    }

    async next(): Promise<void> {
        await this.#airplay.remote.next();
    }

    async previous(): Promise<void> {
        await this.#airplay.remote.previous();
    }

    async channelUp(): Promise<void> {
        await this.#airplay.remote.channelUp();
    }

    async channelDown(): Promise<void> {
        await this.#airplay.remote.channelDown();
    }

    // --- Volume keys (Consumer page 0x0C) ---

    async volumeUp(): Promise<void> {
        await this.#airplay.remote.volumeUp();
    }

    async volumeDown(): Promise<void> {
        await this.#airplay.remote.volumeDown();
    }

    async mute(): Promise<void> {
        await this.#airplay.remote.mute();
    }

    // --- Power keys (Generic Desktop page 0x01) ---

    async wake(): Promise<void> {
        await this.#airplay.remote.wake();
    }

    async suspend(): Promise<void> {
        await this.#airplay.remote.suspend();
    }

    // --- Touch & Gestures ---

    async tap(x: number, y: number, finger: number = 1): Promise<void> {
        await this.#airplay.remote.tap(x, y, finger);
    }

    async swipe(direction: 'up' | 'down' | 'left' | 'right', duration: number = 200): Promise<void> {
        switch (direction) {
            case 'up':
                await this.#airplay.remote.swipeUp(duration);
                break;
            case 'down':
                await this.#airplay.remote.swipeDown(duration);
                break;
            case 'left':
                await this.#airplay.remote.swipeLeft(duration);
                break;
            case 'right':
                await this.#airplay.remote.swipeRight(duration);
                break;
        }
    }

    // --- HID Primitives ---

    async pressAndRelease(usePage: number, usage: number): Promise<void> {
        await this.#airplay.remote.pressAndRelease(usePage, usage);
    }

    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        await this.#airplay.remote.longPress(usePage, usage, duration);
    }

    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.#airplay.remote.doublePress(usePage, usage);
    }
}
