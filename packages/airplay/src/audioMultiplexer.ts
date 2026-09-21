import { AUDIO_FRAMES_PER_PACKET, type AudioSource, type Context } from '@basmilius/apple-common';
import { AudioStream, type AudioStreamOptions } from './audioStream';
import type { Protocol } from './protocol';
import { streamWithTiming } from './streamTiming';

type Target = {
    protocol: Protocol;
    stream: AudioStream;
};

/**
 * Streams one source to multiple devices with shared timing. Each target has independent encryption and RTP state.
 * Pacing and catch-up use {@link streamWithTiming}, as in single-device streaming.
 */
export class AudioMultiplexer {
    readonly #context: Context;
    readonly #targets: Target[] = [];

    constructor(context: Context) {
        this.#context = context;
    }

    /**
     * Adds a target device to stream to.
     *
     * Creates a new {@link AudioStream} for the device's protocol instance.
     *
     * @param protocol - The AirPlay protocol instance for the target device.
     * @param options - Optional audio stream configuration (e.g. redundancy count).
     */
    addTarget(protocol: Protocol, options?: AudioStreamOptions): void {
        const stream = new AudioStream(protocol, options);

        this.#targets.push({protocol, stream});
    }

    /**
     * Removes all targets and closes their audio streams.
     */
    clear(): void {
        for (const target of this.#targets) {
            target.stream.close();
        }

        this.#targets.length = 0;
    }

    /**
     * Streams audio from a source to all targets simultaneously.
     *
     * Orchestrates the full lifecycle: setup all streams, prepare (connect UDP,
     * FLUSH, start sync), stream audio packets with timing compensation, and
     * finish (padding and TEARDOWN). On error, all streams are closed.
     *
     * @param source - Audio source to read PCM frames from.
     * @throws Re-throws any error after cleaning up all streams.
     */
    async stream(source: AudioSource): Promise<void> {
        if (this.#targets.length === 0) {
            return;
        }

        this.#context.logger.info('[multiplexer]', `Streaming to ${this.#targets.length} device(s)...`);

        await Promise.all(this.#targets.map(async (target) => {
            await target.stream.setup();
        }));

        const contexts = await Promise.all(this.#targets.map(async (target) => {
            return target.stream.prepare(target.protocol.discoveryResult.address);
        }));

        // Use the negotiated format from the first target for frame/packet sizing.
        const sampleRate = contexts[0].sampleRate;
        const packetSize = contexts[0].packetSize;

        try {
            this.#context.logger.info('[multiplexer]', 'Starting multi-room audio stream...');

            const sendPacket = async (firstPacket: boolean): Promise<number> => {
                let frames = await source.readFrames(AUDIO_FRAMES_PER_PACKET);

                if (!frames || frames.length === 0) {
                    return 0;
                }

                if (frames.length < packetSize) {
                    const padded = Buffer.alloc(packetSize, 0);
                    frames.copy(padded);
                    frames = padded;
                }

                await Promise.all(this.#targets.map(async (target) => {
                    await target.stream.sendFrameData(frames!, firstPacket);
                }));

                return AUDIO_FRAMES_PER_PACKET;
            };

            const packetCount = await streamWithTiming(sendPacket, {
                sampleRate,
                logger: this.#context.logger,
                logPrefix: '[multiplexer]'
            });

            this.#context.logger.info('[multiplexer]', `Multi-room stream finished, sent ${packetCount} packets to ${this.#targets.length} device(s)`);

            await Promise.all(this.#targets.map(async (target) => {
                await target.stream.finish();
                target.stream.close();
            }));
        } catch (err) {
            for (const target of this.#targets) {
                target.stream.close();
            }

            throw err;
        }
    }
}
