import type { Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { ConnectionClosedError, PlaybackError } from '@corewire/core';
import { type CloseReason, Context } from '@corewire/core/transport';
import type { AudioSource } from '../audio/source';
import { AudioSourceSession } from '../audio/sourceSession';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_FRAMES_PER_PACKET, AUDIO_SAMPLE_RATE } from '../const';
import { MISSING_METADATA } from './const';
import { RaopRtspClient } from './rtspClient';
import { StreamClient } from './streamClient';
import type { MediaMetadata, RaopConnectOptions, RaopEventMap, RaopPlayback, RaopPlaybackInfo, RaopStreamOptions, RaopTarget, Settings, StreamContext, StreamProtocol } from './types';

/** Where the RAOP service listens when the target does not say. */
const DEFAULT_PORT = 7000;

/** Interval in milliseconds of the `/feedback` keepalive during a stream. */
const FEEDBACK_INTERVAL = 2000;

/**
 * Connects to a RAOP (AirPlay 1 audio) receiver and returns a ready session: the RTSP connection,
 * the control channel, `GET /info`, `/auth-setup` for an AirPort, then ANNOUNCE and SETUP.
 *
 * @throws {ConnectionClosedError} When the signal aborts during the handshake.
 */
export async function connect(target: RaopTarget, options: RaopConnectOptions): Promise<RaopSession> {
    const signal = options.signal;

    if (signal?.aborted) {
        throw new ConnectionClosedError('RAOP setup was interrupted.');
    }

    const context = options.context ?? new Context(target.id ?? target.address);
    const rtsp = new RaopRtspClient(context, target.address, target.port ?? DEFAULT_PORT);
    const interrupt = (): void => rtsp.destroy();
    let streamClient: StreamClient | undefined;

    signal?.addEventListener('abort', interrupt, {once: true});

    try {
        await rtsp.connect();

        const streamContext = createStreamContext();
        streamContext.rtspSession = rtsp.rtspSessionId;

        const settings: Settings = {
            protocols: {
                raop: {
                    controlPort: 0,
                    timingPort: 0
                }
            }
        };

        const missingMetadata = {...MISSING_METADATA, ...options.metadata};
        const protocol = new RaopStreamProtocol(rtsp, streamContext, options.password);

        streamClient = new StreamClient(context, rtsp, streamContext, protocol, settings, options.timing, missingMetadata);

        await streamClient.initialize(new Map(Object.entries(target.txt ?? {})));

        if (signal?.aborted || !rtsp.isConnected) {
            throw new ConnectionClosedError('RAOP setup was interrupted.');
        }

        return new RaopSession(target, context, rtsp, streamClient, streamContext, signal);
    } catch (err) {
        streamClient?.close();
        rtsp.destroy();

        throw signal?.aborted ? new ConnectionClosedError('RAOP setup was interrupted.') : err;
    } finally {
        signal?.removeEventListener('abort', interrupt);
    }
}

/**
 * One RAOP connection to a receiver. It lives once: it ends exactly once, with a reason, and then
 * its {@link signal} aborts and a running stream stops. One stream runs at a time.
 */
export class RaopSession extends EventEmitter<RaopEventMap> {
    /** Why the session ended, or undefined while it is open. */
    get closeReason(): CloseReason | undefined {
        return this.#closeReason;
    }

    get context(): Context {
        return this.#context;
    }

    /** The `/info` plist of the receiver; empty when it did not answer. */
    get info(): Record<string, unknown> {
        return this.#streamClient.info;
    }

    get isOpen(): boolean {
        return !this.signal.aborted;
    }

    /** Aborts with a {@link ConnectionClosedError} when the session ends. */
    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    get target(): RaopTarget {
        return this.#target;
    }

    /** The volume last sent to the receiver, in dBFS. */
    get volumeDb(): number {
        return this.#streamContext.volume;
    }

    readonly #context: Context;
    readonly #controller: AbortController = new AbortController();
    readonly #rtsp: RaopRtspClient;
    readonly #streamClient: StreamClient;
    readonly #streamContext: StreamContext;
    readonly #target: RaopTarget;
    #closeReason?: CloseReason;
    #playback?: RaopPlayback;

    /** Use {@link connect}; a session starts from a finished handshake. */
    constructor(target: RaopTarget, context: Context, rtsp: RaopRtspClient, streamClient: StreamClient, streamContext: StreamContext, signal?: AbortSignal) {
        super();

        this.#context = context;
        this.#rtsp = rtsp;
        this.#streamClient = streamClient;
        this.#streamContext = streamContext;
        this.#target = target;

        this.#rtsp.on('closed', (reason, error) => this.#end(reason, error));
        this.#streamClient.on('playing', info => this.emit('playing', info));
        this.#streamClient.on('stopped', () => this.emit('stopped'));

        signal?.addEventListener('abort', () => void this.close(), {once: true, signal: this.signal});
    }

    /** Stops a running stream and closes the connection, without TEARDOWN of an idle session. */
    async close(): Promise<void> {
        if (this.signal.aborted) {
            return;
        }

        this.#playback?.stop();
        this.#streamClient.close();

        await this.#rtsp.disconnect();

        this.#end('local');
    }

    /** Sends a volume in dBFS, -144 (silent) to 0, with SET_PARAMETER. */
    async setVolumeDb(volumeDb: number): Promise<void> {
        this.#assertOpen();

        await this.#streamClient.setVolume(volumeDb);
    }

    /**
     * Streams PCM audio: metadata, RECORD, FLUSH and the volume, then the audio over RTP. Resolves
     * once the audio flows; {@link RaopPlayback.ended} settles when the source ran out and TEARDOWN
     * went out. The source is stopped in every case.
     *
     * @throws {PlaybackError} When a stream is already running.
     */
    async stream(source: AudioSource, options: RaopStreamOptions = {}): Promise<RaopPlayback> {
        this.#assertOpen();

        if (this.#playback) {
            throw new PlaybackError('A RAOP stream is already active.');
        }

        const sourceSession = new AudioSourceSession(source);
        const streamClient = this.#streamClient;
        let onStreaming: () => void;
        const streaming = new Promise<void>(resolve => onStreaming = resolve);

        const stop = (): void => {
            streamClient.stop();
            void sourceSession.stop().catch(error => this.#context.logger.error('[raop]', 'Source cleanup failed', error));
        };

        const run = async (): Promise<void> => {
            try {
                await sourceSession.start();
                await streamClient.sendAudio(sourceSession, options.metadata, options.volumeDb, onStreaming);
            } finally {
                await sourceSession.stop();

                if (this.#playback?.stop === stop) {
                    this.#playback = undefined;
                }
            }
        };

        const playback: RaopPlayback = {ended: run(), stop};

        // Nobody may be waiting yet when streaming fails; `ended` still rejects for whoever looks.
        playback.ended.catch(() => undefined);

        this.#playback = playback;

        await Promise.race([streaming, playback.ended]);

        return playback;
    }

    #assertOpen(): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError('This RAOP session has closed.');
        }
    }

    /** The single exit: aborts the signal, stops a running stream and emits `closed`. */
    #end(reason: CloseReason, error?: Error): void {
        if (this.#closeReason) {
            return;
        }

        this.#closeReason = reason;
        this.#context.logger.net('[raop]', `RAOP session closed (${reason}${error ? `: ${error.message}` : ''}).`);

        this.#playback?.stop();
        this.#streamClient.close();
        this.#controller.abort(new ConnectionClosedError(`RAOP session closed (${reason}).`));
        this.#rtsp.destroy();

        this.emit('closed', reason, error);
    }
}

/**
 * RAOP-specific implementation of the StreamProtocol interface.
 * Handles RTSP ANNOUNCE/SETUP for transport negotiation, periodic
 * feedback keepalives, and raw UDP audio packet sending.
 */
class RaopStreamProtocol implements StreamProtocol {
    readonly #password?: string;
    readonly #rtsp: RaopRtspClient;
    readonly #streamContext: StreamContext;
    #feedbackInterval?: NodeJS.Timeout;

    /** @param password - Answers a digest challenge on ANNOUNCE; without one a 401 fails the setup. */
    constructor(rtsp: RaopRtspClient, streamContext: StreamContext, password?: string) {
        this.#password = password;
        this.#rtsp = rtsp;
        this.#streamContext = streamContext;
    }

    /**
     * Announces the audio format and sets up the RTP transport by
     * sending RTSP ANNOUNCE and SETUP requests. Parses the server's
     * response to extract assigned server and control ports.
     *
     * @param timingPort - Local NTP timing server port.
     * @param controlPort - Local control channel port.
     */
    async setup(timingPort: number, controlPort: number): Promise<void> {
        await this.#rtsp.announce(
            this.#streamContext.bytesPerChannel,
            this.#streamContext.channels,
            this.#streamContext.sampleRate,
            this.#password
        );

        const transport = [
            'RTP/AVP/UDP',
            'unicast',
            'interleaved=0-1',
            'mode=record',
            `control_port=${controlPort}`,
            `timing_port=${timingPort}`
        ].join(';');

        const response = await this.#rtsp.setup({
            'Transport': transport
        });

        const transportHeader = response.headers.get('Transport');

        if (!transportHeader) {
            return;
        }

        const serverPortMatch = transportHeader.match(/server_port=(\d+)/);

        if (serverPortMatch) {
            this.#streamContext.serverPort = parseInt(serverPortMatch[1], 10);
        }

        const controlPortMatch = transportHeader.match(/control_port=(\d+)/);

        if (controlPortMatch) {
            this.#streamContext.controlPort = parseInt(controlPortMatch[1], 10);
        }
    }

    /** Sends `POST /feedback` every two seconds to keep the RAOP session alive during streaming. */
    async startFeedback(): Promise<void> {
        this.#feedbackInterval = setInterval(async () => {
            try {
                await this.#rtsp.feedback(true);
            } catch (err) {
                this.#rtsp.context.logger.warn('[raop]', 'Feedback failed', err);
            }
        }, FEEDBACK_INTERVAL);
    }

    /**
     * Sends a single audio packet over the UDP transport by concatenating
     * the RTP header with the audio payload.
     *
     * @returns A tuple of [sequence number, full packet buffer] for backlog storage.
     */
    async sendAudioPacket(transport: UdpSocket, header: Buffer, audio: Buffer): Promise<[number, Buffer]> {
        const packet = Buffer.concat([header, audio]);
        const seqno = header.readUInt16BE(2);

        await new Promise<void>((resolve, reject) => {
            transport.send(packet, (err) => err ? reject(err) : resolve());
        });

        return [seqno, packet];
    }

    /** Stops the feedback interval timer, ending periodic keepalive requests. */
    teardown(): void {
        if (!this.#feedbackInterval) {
            return;
        }

        clearInterval(this.#feedbackInterval);

        this.#feedbackInterval = undefined;
    }
}

/**
 * Creates a fresh StreamContext with CD-quality audio defaults
 * (44100 Hz, stereo, 16-bit) and randomized RTP sequence/timestamp values.
 */
function createStreamContext(): StreamContext {
    const rtptime = Math.floor(Math.random() * 0xFFFFFFFF);

    return {
        sampleRate: AUDIO_SAMPLE_RATE,
        channels: AUDIO_CHANNELS,
        bytesPerChannel: AUDIO_BYTES_PER_CHANNEL,
        rtpseq: Math.floor(Math.random() * 65536),
        rtptime,
        headTs: rtptime,
        latency: Math.floor(AUDIO_SAMPLE_RATE * 2),
        serverPort: 0,
        controlPort: 0,
        rtspSession: '',
        volume: -20,
        position: 0,
        packetSize: AUDIO_FRAMES_PER_PACKET * AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL,
        frameSize: AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL,
        paddingSent: 0,

        reset() {
            this.rtpseq = Math.floor(Math.random() * 65536);
            this.rtptime = Math.floor(Math.random() * 0xFFFFFFFF);
            this.headTs = this.rtptime;
            this.paddingSent = 0;
            this.position = 0;
        }
    };
}
