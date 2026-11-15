import type { Context } from '@corewire/core/transport';
import { AUDIO_FRAMES_PER_PACKET } from '../const';
import { type AudioLink, type AirPlaySession, openAudioLink } from '../session';
import type { StreamAudioOptions } from '../types';
import { streamWithTiming } from './pacing';
import type { AudioSource } from './source';
import { AudioSourceSession } from './sourceSession';
import type { AudioStreamContext, AudioStreamOptions } from './stream';

type TargetOptions = Omit<StreamAudioOptions, 'signal'> & AudioStreamOptions;

type Target = {
    readonly session: AirPlaySession;
    readonly options: TargetOptions;
};

/**
 * Streams one source to several receivers with shared timing. Every target gets its own audio
 * connection with independent encryption and RTP state. Pacing and catch-up use
 * {@link streamWithTiming}, as single-receiver streaming does.
 */
export class AudioMultiplexer {
    readonly #context: Context;
    readonly #targets: Target[] = [];
    #abort?: AbortController;
    #source?: AudioSourceSession;

    constructor(context: Context) {
        this.#context = context;
    }

    /** Adds a receiver; its audio connection opens when {@link stream} starts. */
    addTarget(session: AirPlaySession, options: TargetOptions = {}): void {
        this.#targets.push({session, options});
    }

    /** Removes all targets and ends a running stream. */
    clear(): void {
        void this.#source?.stop().catch(error => this.#context.logger.error('Audio source cleanup failed', error));
        this.#abort?.abort();
        this.#targets.length = 0;
    }

    /**
     * Opens an audio connection per target, sets up and prepares every stream, streams the source
     * to all of them and finishes with padding and TEARDOWN. Any failure closes every stream.
     */
    async stream(source: AudioSource): Promise<void> {
        if (this.#targets.length === 0) {
            return;
        }

        if (this.#source) {
            throw new Error('A multiroom stream is already active.');
        }

        this.#context.logger.info('[multiplexer]', `Streaming to ${this.#targets.length} device(s)...`);

        const abort = this.#abort = new AbortController();
        const session = this.#source = new AudioSourceSession(source);
        const links: AudioLink[] = [];

        try {
            const opened = await Promise.allSettled(this.#targets.map(target => openAudioLink(target.session, {...target.options, signal: abort.signal})));

            for (const result of opened) {
                if (result.status === 'fulfilled') {
                    links.push(result.value);
                }
            }

            const failedOpen = opened.find(result => result.status === 'rejected');

            if (failedOpen?.status === 'rejected') {
                throw failedOpen.reason;
            }

            const setups = await Promise.allSettled(links.map(link => link.stream.setup()));
            const failedSetup = setups.find(result => result.status === 'rejected');

            if (failedSetup?.status === 'rejected') {
                throw failedSetup.reason;
            }

            const prepared = await Promise.allSettled(links.map(link => link.stream.prepare(link.session.target.address)));
            const failedPrepare = prepared.find(result => result.status === 'rejected');

            if (failedPrepare?.status === 'rejected') {
                throw failedPrepare.reason;
            }

            const contexts = prepared.map(result => (result as PromiseFulfilledResult<AudioStreamContext>).value);
            const sampleRate = contexts[0].sampleRate;
            const packetSize = contexts[0].packetSize;

            if (session.stopped) {
                return;
            }

            await session.start();
            this.#context.logger.info('[multiplexer]', 'Starting multi-room audio stream...');

            const sendPacket = async (firstPacket: boolean): Promise<number> => {
                let frames = await session.readFrames(AUDIO_FRAMES_PER_PACKET);

                if (!frames || frames.length === 0) {
                    return 0;
                }

                if (frames.length < packetSize) {
                    const padded = Buffer.alloc(packetSize, 0);

                    frames.copy(padded);
                    frames = padded;
                }

                await Promise.all(links.map(async (link) => {
                    await link.stream.sendFrameData(frames!, firstPacket);
                }));

                return AUDIO_FRAMES_PER_PACKET;
            };

            const packetCount = await streamWithTiming(sendPacket, {
                sampleRate,
                logger: this.#context.logger,
                logPrefix: '[multiplexer]'
            });

            this.#context.logger.info('[multiplexer]', `Multi-room stream finished, sent ${packetCount} packets to ${links.length} device(s)`);

            await Promise.all(links.map(async (link) => {
                await link.stream.finish();
                link.stream.close();
            }));
        } finally {
            for (const link of links) {
                link.stream.close();
                void link.session.close();
            }

            await session.stop();

            if (this.#source === session) {
                this.#source = undefined;
                this.#abort = undefined;
            }
        }
    }
}
