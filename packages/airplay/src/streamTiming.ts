import { AUDIO_FRAMES_PER_PACKET, type Logger, waitFor } from '@basmilius/apple-common';

/** Maximum number of extra packets to send when catching up from being behind schedule. */
const MAX_PACKETS_COMPENSATE = 3;

/** Number of consecutive slow packets before logging a warning. */
const SLOW_WARNING_THRESHOLD = 5;

/**
 * Options for the timed streaming loop.
 */
export type StreamTimingOptions = {
    /** Sample rate in Hz, used to calculate expected playback time. */
    readonly sampleRate: number;
    /** Logger instance for debug, info and warning messages. */
    readonly logger: Logger;
    /** Log prefix for identifying the caller (e.g. '[audio]' or '[multiplexer]'). */
    readonly logPrefix: string;
};

/**
 * Callback that sends one packet worth of audio frames.
 *
 * Must return the number of frames sent. Return `0` to indicate end-of-stream
 * (source exhausted and all padding sent). The `firstPacket` flag is `true` only
 * for the very first call and `false` for all subsequent calls (including
 * compensation packets).
 */
export type SendPacketFn = (firstPacket: boolean) => Promise<number>;

/**
 * Runs a real-time audio streaming loop with wall-clock timing compensation.
 *
 * Reads and sends packets via the provided {@link sendPacket} callback, pacing
 * them to match real-time playback. When the loop falls behind schedule, it
 * sends up to {@link MAX_PACKETS_COMPENSATE} extra packets per cycle to catch
 * up. Logs progress every 100 packets and warns when consistently behind.
 *
 * @param sendPacket - Callback that sends one packet and returns frames sent (0 = done).
 * @param options - Timing configuration (sample rate, logger, log prefix).
 * @returns Total number of packets sent.
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
