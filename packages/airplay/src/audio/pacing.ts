import { type Logger, waitFor } from '@corewire/core';
import { AUDIO_FRAMES_PER_PACKET } from '../const';

/** Maximum number of extra packets per cycle when catching up. */
const MAX_PACKETS_COMPENSATE = 3;

/** Number of consecutive slow packets before logging a warning. */
const SLOW_WARNING_THRESHOLD = 5;

export type StreamTimingOptions = {
    /** Sample rate in Hz. */
    readonly sampleRate: number;

    readonly logger: Logger;

    /** Identifies the caller in log messages, for example `'[audio]'`. */
    readonly logPrefix: string;
};

/**
 * Sends one packet of audio frames and returns the number of frames sent, or
 * `0` at the end of the stream. `firstPacket` is `true` only on the first
 * call, compensation packets included.
 */
export type SendPacketFn = (firstPacket: boolean) => Promise<number>;

/**
 * Paces audio packets against wall-clock time, sending up to {@link MAX_PACKETS_COMPENSATE} extra packets per cycle when behind.
 *
 * @param sendPacket - Returns frames sent, or 0 when done.
 * @returns Total packets sent.
 */
export async function streamWithTiming(sendPacket: SendPacketFn, options: StreamTimingOptions): Promise<number> {
    const {sampleRate, logger, logPrefix} = options;

    let firstPacket = true;
    let packetCount = 0;
    let slowCount = 0;
    let totalFrames = 0;
    const startTime = performance.now();

    while (true) {
        const framesSent = await sendPacket(firstPacket);

        if (framesSent === 0) {
            logger.debug(logPrefix, `End of stream after ${packetCount} packets`);

            break;
        }

        totalFrames += framesSent;
        packetCount++;
        firstPacket = false;

        if (packetCount % 100 === 0) {
            logger.debug(logPrefix, `Sent ${packetCount} packets, ${totalFrames} frames`);
        }

        const expectedTime = totalFrames / sampleRate * 1000;
        const actualTime = performance.now() - startTime;
        const sleepTime = expectedTime - actualTime;

        if (sleepTime > 0) {
            slowCount = 0;
            await waitFor(sleepTime);
        } else {
            const framesBehind = Math.floor((-sleepTime / 1000) * sampleRate);

            if (framesBehind >= AUDIO_FRAMES_PER_PACKET) {
                const extraPackets = Math.min(
                    Math.floor(framesBehind / AUDIO_FRAMES_PER_PACKET),
                    MAX_PACKETS_COMPENSATE
                );

                for (let idx = 0; idx < extraPackets; idx++) {
                    const extra = await sendPacket(false);

                    if (extra === 0) {
                        break;
                    }

                    totalFrames += extra;
                    packetCount++;
                }
            }

            slowCount++;

            if (slowCount >= SLOW_WARNING_THRESHOLD) {
                logger.warn(logPrefix, `Stream behind schedule (${slowCount} consecutive, ${Math.abs(sleepTime).toFixed(1)}ms behind)`);
                slowCount = 0;
            }
        }
    }

    return packetCount;
}
