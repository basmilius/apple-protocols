import type { AirPlaySession } from '../session';
import type { AudioSourceSession } from './sourceSession';
import type { AudioStream, AudioStreamStats } from './stream';

/**
 * A running audio stream on a connection of its own. Owns that connection and the source: both
 * end when the source runs out, on {@link stop}, or when the session it came from ends.
 */
export class AudioPlayback {
    /**
     * Settles when streaming is over: resolves once the source ran out and TEARDOWN went out,
     * rejects when the stream failed or was stopped halfway.
     */
    get finished(): Promise<void> {
        return this.#finished;
    }

    /** Aborts when the stream's connection closes. */
    get signal(): AbortSignal {
        return this.#session.signal;
    }

    get stats(): AudioStreamStats {
        return this.#stream.stats;
    }

    readonly #finished: Promise<void>;
    readonly #session: AirPlaySession;
    readonly #source: AudioSourceSession;
    readonly #stream: AudioStream;

    constructor(session: AirPlaySession, stream: AudioStream, source: AudioSourceSession) {
        this.#session = session;
        this.#source = source;
        this.#stream = stream;
        this.#finished = this.#run();

        // Nobody may be waiting yet when streaming fails; `finished` still rejects for whoever looks.
        this.#finished.catch(() => undefined);
    }

    /** Stops the source and closes the connection, without TEARDOWN. */
    stop(): void {
        void this.#source.stop().catch(error => this.#session.context.logger.error('Audio source cleanup failed', error));
        void this.#session.close();
    }

    async #run(): Promise<void> {
        try {
            await this.#stream.stream(this.#source, this.#session.target.address);
        } finally {
            // The session goes first, so a source that fails or hangs on stop cannot keep it open.
            this.#stream.close();
            void this.#session.close();
            await this.#source.stop();
        }
    }
}
