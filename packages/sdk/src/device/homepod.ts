import type { DeviceOptions } from '../types';
import { AbstractDevice } from './device';

/**
 * High-level HomePod device using AirPlay only (transient pairing).
 * Provides media playback, URL playback, audio streaming, and volume control.
 * No credentials needed — transient pairing is handled transparently.
 *
 * ```ts
 * const pod = new HomePod({ airplay: result });
 * await pod.connect();
 * await pod.media.playUrl('https://example.com/song.mp3');
 * ```
 */
export class HomePod extends AbstractDevice {
    constructor(options: DeviceOptions) {
        super(options);
    }

    /**
     * Connects to the HomePod using transient pairing (no credentials needed).
     */
    async connect(): Promise<void> {
        await this.airplay.connect();
    }

    protected onAirPlayConnected(): void {
        super.onAirPlayConnected();
        this.emit('connected');
    }

    protected onAirPlayDisconnected(unexpected: boolean): void {
        super.onAirPlayDisconnected(unexpected);
        this.emit('disconnected', unexpected);
    }
}
