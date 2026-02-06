import { EventEmitter } from 'node:events';
import type { Socket as UdpSocket } from 'node:dgram';
import { type AudioSource, Context, Discovery, type DiscoveryResult, TimingServer } from '@basmilius/apple-common';
import type { MediaMetadata, PlaybackInfo, Settings, StreamContext, StreamProtocol } from './types';
import RtspClient from './rtspClient';
import StreamClient from './streamClient';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;
const FRAMES_PER_PACKET = 352;

export type EventMap = {
    readonly playing: [playbackInfo: PlaybackInfo];
    readonly stopped: [];
};

export type StreamOptions = {
    readonly metadata?: MediaMetadata;
    readonly volume?: number;
}

export class RaopClient extends EventEmitter<EventMap> {
    get context(): Context {
        return this.#context;
    }

    get deviceId(): string {
        return this.#discoveryResult.id;
    }

    get address(): string {
        return this.#discoveryResult.address;
    }

    get modelName(): string {
        return this.#discoveryResult.modelName;
    }

    get info(): Record<string, unknown> {
        return this.#streamClient.info;
    }

    readonly #context: Context;
    readonly #rtsp: RtspClient;
    readonly #streamClient: StreamClient;
    readonly #discoveryResult: DiscoveryResult;

    private constructor(context: Context, rtsp: RtspClient, streamClient: StreamClient, discoveryResult: DiscoveryResult) {
        super();

        this.#context = context;
        this.#rtsp = rtsp;
        this.#streamClient = streamClient;
        this.#discoveryResult = discoveryResult;

        this.#streamClient.on('playing', info => this.emit('playing', info));
        this.#streamClient.on('stopped', () => this.emit('stopped'));
    }

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

    stop(): void {
        this.#streamClient.stop();
    }

    async setVolume(volume: number): Promise<void> {
        await this.#streamClient.setVolume(volume);
    }

    async close(): Promise<void> {
        this.#streamClient.close();
        await this.#rtsp.disconnect();
    }

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

    static async discover(deviceId: string, timingServer: TimingServer): Promise<RaopClient> {
        const discovery = Discovery.raop();
        const result = await discovery.findUntil(deviceId);

        return RaopClient.create(result, timingServer);
    }
}

class RaopStreamProtocol implements StreamProtocol {
    readonly #rtsp: RtspClient;
    readonly #streamContext: StreamContext;
    #feedbackInterval?: NodeJS.Timeout;

    constructor(rtsp: RtspClient, streamContext: StreamContext) {
        this.#rtsp = rtsp;
        this.#streamContext = streamContext;
    }

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

    async startFeedback(): Promise<void> {
        this.#feedbackInterval = setInterval(async () => {
            try {
                await this.#rtsp.feedback(true);
            } catch {
            }
        }, 2000);
    }

    async sendAudioPacket(transport: UdpSocket, header: Buffer, audio: Buffer): Promise<[number, Buffer]> {
        const packet = Buffer.concat([header, audio]);
        const seqno = header.readUInt16BE(2);

        await new Promise<void>((resolve, reject) => {
            transport.send(packet, (err) => err ? reject(err) : resolve());
        });

        return [seqno, packet];
    }

    teardown(): void {
        if (!this.#feedbackInterval) {
            return;
        }

        clearInterval(this.#feedbackInterval);

        this.#feedbackInterval = undefined;
    }
}

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
