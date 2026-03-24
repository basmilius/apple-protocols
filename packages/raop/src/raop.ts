import { EventEmitter } from 'node:events';
import type { Socket as UdpSocket } from 'node:dgram';
import { type AudioSource, Context, Discovery, type DiscoveryResult, TimingServer } from '@basmilius/apple-common';
import type { MediaMetadata, PlaybackInfo, Settings, StreamContext, StreamProtocol } from './types';
import RtspClient from './rtspClient';
import StreamClient from './streamClient';

/** Default audio sample rate in Hz (CD quality). */
const SAMPLE_RATE = 44100;

/** Default number of audio channels (stereo). */
const CHANNELS = 2;

/** Default bytes per channel sample (16-bit). */
const BYTES_PER_CHANNEL = 2;

/** Number of audio frames per RTP packet. */
const FRAMES_PER_PACKET = 352;

/**
 * Event map for the RaopClient, emitted during the streaming lifecycle.
 */
export type EventMap = {
    /** Emitted when audio playback starts, providing current playback info. */
    readonly playing: [playbackInfo: PlaybackInfo];
    /** Emitted when audio playback stops. */
    readonly stopped: [];
};

/**
 * Options for configuring an audio stream session.
 */
export type StreamOptions = {
    /** Optional track metadata to display on the receiver. */
    readonly metadata?: MediaMetadata;
    /** Optional initial volume as a percentage (0-100). */
    readonly volume?: number;
}

/**
 * High-level RAOP client for streaming audio to AirPlay receivers.
 * Wraps the RTSP handshake, UDP audio transport, control channel,
 * and metadata publishing into a simple stream/stop/close API.
 *
 * Instances are created via the static `create()` or `discover()` methods.
 */
export class RaopClient extends EventEmitter<EventMap> {
    /** Application context providing logger and device identity. */
    get context(): Context {
        return this.#context;
    }

    /** Unique identifier of the discovered RAOP device. */
    get deviceId(): string {
        return this.#discoveryResult.id;
    }

    /** IP address of the RAOP receiver. */
    get address(): string {
        return this.#discoveryResult.address;
    }

    /** Model name of the RAOP receiver (e.g. "AirPort Express"). */
    get modelName(): string {
        return this.#discoveryResult.modelName;
    }

    /** Device info dictionary fetched during initialization. */
    get info(): Record<string, unknown> {
        return this.#streamClient.info;
    }

    /** Application context for logging and identity. */
    readonly #context: Context;
    /** RAOP RTSP client for protocol-level commands. */
    readonly #rtsp: RtspClient;
    /** Stream client managing audio transport and metadata. */
    readonly #streamClient: StreamClient;
    /** mDNS discovery result for this device. */
    readonly #discoveryResult: DiscoveryResult;

    /**
     * Private constructor — use `RaopClient.create()` or `RaopClient.discover()` instead.
     *
     * @param context - Application context.
     * @param rtsp - Connected RTSP client.
     * @param streamClient - Initialized stream client.
     * @param discoveryResult - mDNS discovery result for the device.
     */
    private constructor(context: Context, rtsp: RtspClient, streamClient: StreamClient, discoveryResult: DiscoveryResult) {
        super();

        this.#context = context;
        this.#rtsp = rtsp;
        this.#streamClient = streamClient;
        this.#discoveryResult = discoveryResult;

        this.#streamClient.on('playing', info => this.emit('playing', info));
        this.#streamClient.on('stopped', () => this.emit('stopped'));
    }

    /**
     * Streams audio from a source to the RAOP receiver. Starts the source,
     * sends audio data over RTP, and stops the source when finished or on error.
     *
     * @param source - Audio source providing PCM frames.
     * @param options - Optional metadata and volume settings.
     */
    async stream(source: AudioSource, options: StreamOptions = {}): Promise<void> {
        await source.start();

        try {
            await this.#streamClient.sendAudio(
                source,
                options.metadata,
                options.volume
            );
        } finally {
            await source.stop();
        }
    }

    /**
     * Signals the stream client to stop sending audio. The current
     * `stream()` call will complete after flushing remaining data.
     */
    stop(): void {
        this.#streamClient.stop();
    }

    /**
     * Changes the playback volume on the receiver.
     *
     * @param volume - Volume level in dBFS.
     */
    async setVolume(volume: number): Promise<void> {
        await this.#streamClient.setVolume(volume);
    }

    /**
     * Closes all connections and releases resources. Disconnects the
     * RTSP session and shuts down the control channel.
     */
    async close(): Promise<void> {
        this.#streamClient.close();
        await this.#rtsp.disconnect();
    }

    /**
     * Creates a new RaopClient from a pre-discovered device. Connects
     * via RTSP, initializes the stream context, and negotiates transport.
     *
     * @param discoveryResult - mDNS discovery result for the target device.
     * @param timingServer - NTP timing server for clock synchronization.
     * @returns A fully initialized and connected RaopClient.
     */
    static async create(discoveryResult: DiscoveryResult, timingServer: TimingServer): Promise<RaopClient> {
        const context = new Context(discoveryResult.id);
        const rtsp = new RtspClient(context, discoveryResult.address, discoveryResult.service.port);

        await rtsp.connect();

        const streamContext = createStreamContext();
        streamContext.rtspSession = rtsp.rtspSessionId;

        const protocol = new RaopStreamProtocol(rtsp, streamContext);

        const settings: Settings = {
            protocols: {
                raop: {
                    controlPort: 0,
                    timingPort: 0
                }
            }
        };

        const streamClient = new StreamClient(context, rtsp, streamContext, protocol, settings, timingServer);

        const properties = new Map<string, string>(Object.entries(discoveryResult.txt));
        await streamClient.initialize(properties);

        return new RaopClient(context, rtsp, streamClient, discoveryResult);
    }

    /**
     * Discovers a RAOP device by its device ID via mDNS, then creates
     * and returns a connected RaopClient.
     *
     * @param deviceId - Unique device identifier to search for.
     * @param timingServer - NTP timing server for clock synchronization.
     * @returns A fully initialized and connected RaopClient.
     */
    static async discover(deviceId: string, timingServer: TimingServer): Promise<RaopClient> {
        const discovery = Discovery.raop();
        const result = await discovery.findUntil(deviceId);

        return RaopClient.create(result, timingServer);
    }
}

/**
 * RAOP-specific implementation of the StreamProtocol interface.
 * Handles RTSP ANNOUNCE/SETUP for transport negotiation, periodic
 * feedback keepalives, and raw UDP audio packet sending.
 */
class RaopStreamProtocol implements StreamProtocol {
    /** RTSP client for protocol commands. */
    readonly #rtsp: RtspClient;
    /** Shared stream context for port and format state. */
    readonly #streamContext: StreamContext;
    /** Interval timer for periodic feedback requests. */
    #feedbackInterval?: NodeJS.Timeout;

    /**
     * Creates a new RAOP stream protocol handler.
     *
     * @param rtsp - RAOP RTSP client for sending protocol commands.
     * @param streamContext - Shared mutable streaming state.
     */
    constructor(rtsp: RtspClient, streamContext: StreamContext) {
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
            this.#streamContext.sampleRate
        );

        const transport = [
            'RTP/AVP/UDP',
            'unicast',
            'interleaved=0-1',
            'mode=record',
            `control_port=${controlPort}`,
            `timing_port=${timingPort}`
        ].filter(Boolean).join(';');

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

    /**
     * Starts sending periodic feedback POST requests every 2 seconds
     * to keep the RAOP session alive during streaming.
     */
    async startFeedback(): Promise<void> {
        this.#feedbackInterval = setInterval(async () => {
            try {
                await this.#rtsp.feedback(true);
            } catch (err) {
                this.#rtsp.context.logger.warn('[raop]', 'Feedback failed', err);
            }
        }, 2000);
    }

    /**
     * Sends a single audio packet over the UDP transport by concatenating
     * the RTP header with the audio payload.
     *
     * @param transport - UDP socket connected to the receiver's audio port.
     * @param header - 12-byte RTP header.
     * @param audio - Raw audio payload data.
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

    /**
     * Stops the feedback interval timer, ending periodic keepalive requests.
     */
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
 *
 * @returns A new mutable stream context ready for use in a streaming session.
 */
function createStreamContext(): StreamContext {
    return {
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        bytesPerChannel: BYTES_PER_CHANNEL,
        rtpseq: Math.floor(Math.random() * 65536),
        rtptime: Math.floor(Math.random() * 0xFFFFFFFF),
        headTs: 0,
        latency: Math.floor(SAMPLE_RATE * 2),
        serverPort: 0,
        controlPort: 0,
        rtspSession: '',
        volume: -20,
        position: 0,
        packetSize: FRAMES_PER_PACKET * CHANNELS * BYTES_PER_CHANNEL,
        frameSize: CHANNELS * BYTES_PER_CHANNEL,
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
