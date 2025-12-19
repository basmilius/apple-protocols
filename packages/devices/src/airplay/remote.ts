import type { AirPlay, AirPlayDataStream } from '@basmilius/apple-airplay';
import { waitFor } from '@basmilius/apple-common';
import { PROTOCOL } from './const';
import type Device from './device';

export default class {
    get #dataStream(): AirPlayDataStream {
        return this.#protocol.dataStream;
    }

    get #protocol(): AirPlay {
        return this.#device[PROTOCOL];
    }

    readonly #device: Device;

    constructor(device: Device) {
        this.#device = device;
    }

    async up(): Promise<void> {
        await this.pressAndRelease(1, 0x8C);
    }

    async down(): Promise<void> {
        await this.pressAndRelease(1, 0x8D);
    }

    async left(): Promise<void> {
        await this.pressAndRelease(1, 0x8B);
    }

    async right(): Promise<void> {
        await this.pressAndRelease(1, 0x8A);
    }

    async menu(): Promise<void> {
        await this.pressAndRelease(1, 0x86);
    }

    async play(): Promise<void> {
        await this.pressAndRelease(12, 0xB0);
    }

    async pause(): Promise<void> {
        await this.pressAndRelease(12, 0xB1);
    }

    async next(): Promise<void> {
        await this.pressAndRelease(12, 0xB5);
    }

    async previous(): Promise<void> {
        await this.pressAndRelease(12, 0xB6);
    }

    async suspend(): Promise<void> {
        await this.pressAndRelease(1, 0x82);
    }

    async select(): Promise<void> {
        await this.pressAndRelease(1, 0x89);
    }

    async wake(): Promise<void> {
        await this.pressAndRelease(1, 0x83);
    }

    async home(): Promise<void> {
        await this.pressAndRelease(12, 0x40);
    }

    async volumeUp(): Promise<void> {
        await this.pressAndRelease(12, 0xE9);
    }

    async volumeDown(): Promise<void> {
        await this.pressAndRelease(12, 0xEA);
    }

    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.pressAndRelease(usePage, usage);
        await waitFor(150);
        await this.pressAndRelease(usePage, usage);
    }

    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.sendHIDEvent(usePage, usage, true));
        await waitFor(duration);
        await this.#dataStream.exchange(this.#dataStream.messages.sendHIDEvent(usePage, usage, false));
    }

    async pressAndRelease(usePage: number, usage: number): Promise<void> {
        await this.#dataStream.exchange(this.#dataStream.messages.sendHIDEvent(usePage, usage, true));
        await this.#dataStream.exchange(this.#dataStream.messages.sendHIDEvent(usePage, usage, false));
    }
}
