import type { AudioSource, Context } from '@basmilius/apple-common';
import AudioStream, { FRAMES_PER_PACKET, SAMPLE_RATE } from './audioStream';
import type Protocol from './protocol';

const MAX_PACKETS_COMPENSATE = 3;
const SLOW_WARNING_THRESHOLD = 5;

type Target = {
    protocol: Protocol;
    stream: AudioStream;
};

/**
 * Streams audio from a single source to multiple AirPlay devices
 * simultaneously. Each device gets its own AudioStream with independent
 * encryption and RTP state, but they all receive the same audio data
 * with shared timing.
 */
export default class AudioMultiplexer {
    readonly #context: Context;
    readonly #targets: Target[] = [];

    constructor(context: Context) {
        this.#context = context;
    }

    /**
     * Add a target device to stream to.
     */
    addTarget(protocol: Protocol): void {
        const stream = new AudioStream(protocol);

        this.#targets.push({protocol, stream});
    }

    /**
     * Remove all targets and close their streams.
     */
    clear(): void {
        for (const target of this.#targets) {
            target.stream.close();
        }

        this.#targets.length = 0;
    }

    /**
     * Stream audio from a source to all targets simultaneously.
     * Sets up, prepares, and streams to all devices, then tears down.
     */
    async stream(source: AudioSource): Promise<void> {
        if (this.#targets.length === 0) {
            return;
        }

        this.#context.logger.info('[multiplexer]', `Streaming to ${this.#targets.length} device(s)...`);

        // Setup all streams in parallel.
        await Promise.all(this.#targets.map(async (target) => {
            await target.stream.setup();
        }));

        // Prepare all streams in parallel (connect UDP, FLUSH, start sync).
        await Promise.all(this.#targets.map(async (target) => {
            await target.stream.prepare(target.protocol.discoveryResult.address);
        }));

        const frameSize = 2 * 2; // CHANNELS * BYTES_PER_CHANNEL
        const packetSize = FRAMES_PER_PACKET * frameSize;

        try {
            let firstPacket = true;
            let packetCount = 0;
            let slowCount = 0;
            let totalFrames = 0;
            const startTime = performance.now();

            this.#context.logger.info('[multiplexer]', 'Starting multi-room audio stream...');

            while (true) {
                let frames = await source.readFrames(FRAMES_PER_PACKET);

                if (!frames || frames.length === 0) {
                    this.#context.logger.debug('[multiplexer]', `End of source after ${packetCount} packets`);
                    break;
                }

                if (frames.length < packetSize) {
                    const padded = Buffer.alloc(packetSize, 0);
                    frames.copy(padded);
                    frames = padded;
                }

                // Send the same frames to all targets in parallel.
                await Promise.all(this.#targets.map(async (target) => {
                    await target.stream.sendFrameData(frames!, firstPacket);
                }));

                totalFrames += FRAMES_PER_PACKET;
                packetCount++;
                firstPacket = false;

                if (packetCount % 100 === 0) {
                    this.#context.logger.debug('[multiplexer]', `Sent ${packetCount} packets to ${this.#targets.length} device(s)`);
                }

                const expectedTime = totalFrames / SAMPLE_RATE * 1000;
                const actualTime = performance.now() - startTime;
                const sleepTime = expectedTime - actualTime;

                if (sleepTime > 0) {
                    slowCount = 0;
                    await this.#sleep(sleepTime);
                } else {
                    const framesBehind = Math.floor((-sleepTime / 1000) * SAMPLE_RATE);

                    if (framesBehind >= FRAMES_PER_PACKET) {
                        const extraPackets = Math.min(
                            Math.floor(framesBehind / FRAMES_PER_PACKET),
                            MAX_PACKETS_COMPENSATE
                        );

                        for (let i = 0; i < extraPackets; i++) {
                            let extraFrames = await source.readFrames(FRAMES_PER_PACKET);

                            if (!extraFrames || extraFrames.length === 0) {
                                break;
                            }

                            if (extraFrames.length < packetSize) {
                                const padded = Buffer.alloc(packetSize, 0);
                                extraFrames.copy(padded);
                                extraFrames = padded;
                            }

                            await Promise.all(this.#targets.map(async (target) => {
                                await target.stream.sendFrameData(extraFrames!, false);
                            }));

                            totalFrames += FRAMES_PER_PACKET;
                            packetCount++;
                        }
                    }

                    slowCount++;

                    if (slowCount >= SLOW_WARNING_THRESHOLD) {
                        this.#context.logger.warn('[multiplexer]', `Stream behind schedule (${slowCount} consecutive, ${Math.abs(sleepTime).toFixed(1)}ms behind)`);
                        slowCount = 0;
                    }
                }
            }

            this.#context.logger.info('[multiplexer]', `Multi-room stream finished, sent ${packetCount} packets to ${this.#targets.length} device(s)`);

            // Finish all streams in parallel (padding + TEARDOWN).
            await Promise.all(this.#targets.map(async (target) => {
                await target.stream.finish();
            }));
        } catch (err) {
            // Clean up all streams on error.
            for (const target of this.#targets) {
                target.stream.close();
            }

            throw err;
        }
    }

    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
