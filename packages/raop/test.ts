import { Context, Discovery, reporter } from '@basmilius/apple-common';
import { type AudioSource, type MediaMetadata, RtspClient, type Settings, StreamClient, type StreamContext, type StreamProtocol } from './src';
import type { Socket as UdpSocket } from 'node:dgram';
import { spawn } from 'node:child_process';

reporter.all();

// Audio generation settings
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;
const FRAMES_PER_PACKET = 352;

/**
 * Audio source that decodes a file using ffmpeg to raw PCM.
 */
class FileAudioSource implements AudioSource {
    readonly duration: number;
    readonly #frameSize: number;
    readonly #filePath: string;
    readonly #sampleRate: number;
    readonly #channels: number;

    #ffmpeg: ReturnType<typeof spawn> | null = null;
    #buffer: Buffer = Buffer.alloc(0);
    #ended: boolean = false;
    #resolveQueue: Array<(value: Buffer | null) => void> = [];

    constructor(
        filePath: string,
        duration: number,
        sampleRate: number = SAMPLE_RATE,
        channels: number = CHANNELS,
        bytesPerChannel: number = BYTES_PER_CHANNEL
    ) {
        this.#filePath = filePath;
        this.duration = duration;
        this.#sampleRate = sampleRate;
        this.#channels = channels;
        this.#frameSize = channels * bytesPerChannel;
    }

    async start(): Promise<void> {
        this.#ffmpeg = spawn('ffmpeg', [
            '-i', this.#filePath,
            '-f', 's16be',           // Signed 16-bit big-endian PCM
            '-acodec', 'pcm_s16be',
            '-ar', String(this.#sampleRate),
            '-ac', String(this.#channels),
            '-'                       // Output to stdout
        ], {
            stdio: ['ignore', 'pipe', 'ignore']
        });

        this.#ffmpeg.stdout!.on('data', (chunk: Buffer) => {
            this.#buffer = Buffer.concat([this.#buffer, chunk]);
            this.#processQueue();
        });

        this.#ffmpeg.stdout!.on('end', () => {
            this.#ended = true;
            this.#processQueue();
        });

        this.#ffmpeg.on('error', (err) => {
            console.error('ffmpeg error:', err);
            this.#ended = true;
            this.#processQueue();
        });
    }

    #processQueue(): void {
        while (this.#resolveQueue.length > 0) {
            const bytesNeeded = FRAMES_PER_PACKET * this.#frameSize;

            if (this.#buffer.length >= bytesNeeded) {
                const chunk = this.#buffer.subarray(0, bytesNeeded);
                this.#buffer = this.#buffer.subarray(bytesNeeded);
                this.#resolveQueue.shift()!(chunk);
            } else if (this.#ended) {
                if (this.#buffer.length > 0) {
                    const chunk = this.#buffer;
                    this.#buffer = Buffer.alloc(0);
                    this.#resolveQueue.shift()!(chunk);
                } else {
                    this.#resolveQueue.shift()!(null);
                }
            } else {
                break;
            }
        }
    }

    async readframes(count: number): Promise<Buffer | null> {
        const bytesNeeded = count * this.#frameSize;

        if (this.#buffer.length >= bytesNeeded) {
            const chunk = this.#buffer.subarray(0, bytesNeeded);
            this.#buffer = this.#buffer.subarray(bytesNeeded);
            return chunk;
        }

        if (this.#ended) {
            if (this.#buffer.length > 0) {
                const chunk = this.#buffer;
                this.#buffer = Buffer.alloc(0);
                return chunk;
            }
            return null;
        }

        return new Promise((resolve) => {
            this.#resolveQueue.push(resolve);
        });
    }

    stop(): void {
        if (this.#ffmpeg) {
            this.#ffmpeg.kill();
            this.#ffmpeg = null;
        }
    }
}

/**
 * Stream protocol implementation for AirPlay 1 / RAOP.
 */
class RaopStreamProtocol implements StreamProtocol {
    readonly #rtsp: RtspClient;
    readonly #streamContext: StreamContext;
    #feedbackInterval?: NodeJS.Timeout;

    constructor(rtsp: RtspClient, streamContext: StreamContext) {
        this.#rtsp = rtsp;
        this.#streamContext = streamContext;
    }

    async setup(timingPort: number, controlPort: number): Promise<void> {
        // Step 1: ANNOUNCE - Declare audio format via SDP
        console.log('📢 Sending ANNOUNCE...');
        await this.#rtsp.announce(
            this.#streamContext.bytesPerChannel,
            this.#streamContext.channels,
            this.#streamContext.sampleRate
        );
        console.log('✅ ANNOUNCE complete');

        // Step 2: SETUP - Configure transport
        console.log('🔧 Sending SETUP...');
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

        // Parse server port from response
        const transportHeader = response.headers.get('Transport');
        if (transportHeader) {
            const serverPortMatch = transportHeader.match(/server_port=(\d+)/);
            if (serverPortMatch) {
                this.#streamContext.serverPort = parseInt(serverPortMatch[1], 10);
            }

            const controlPortMatch = transportHeader.match(/control_port=(\d+)/);
            if (controlPortMatch) {
                this.#streamContext.controlPort = parseInt(controlPortMatch[1], 10);
            }
        }

        console.log('✅ SETUP complete, server port:', this.#streamContext.serverPort);
    }

    async startFeedback(): Promise<void> {
        this.#feedbackInterval = setInterval(async () => {
            try {
                await this.#rtsp.feedback(true);
            } catch (err) {
                console.error('Feedback error:', err);
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
        if (this.#feedbackInterval) {
            clearInterval(this.#feedbackInterval);
            this.#feedbackInterval = undefined;
        }
    }
}

/**
 * Create a stream context with default values.
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

async function testRaop(): Promise<void> {
    console.log('🔍 Discovering device...');

    const discovery = Discovery.raop();
    const discoveryResult = await discovery.findUntil('Slaapkamer-HomePod.local');

    console.log('✅ Found device:', discoveryResult.id);
    console.log('   Address:', discoveryResult.address);
    console.log('   Port:', discoveryResult.service.port);
    console.log('   TXT:', discoveryResult.txt);

    const context = new Context(discoveryResult.id);
    const rtsp = new RtspClient(context, discoveryResult.address, discoveryResult.service.port);

    console.log('\n📡 Connecting to RTSP...');
    await rtsp.connect();
    console.log('✅ Connected');

    // Get device info
    console.log('\n📋 Getting device info...');
    const info = await rtsp.info();
    console.log('   Info:', info);

    // Create stream context
    const streamContext = createStreamContext();
    streamContext.rtspSession = rtsp.rtspSessionId;

    // Create protocol and stream client
    const protocol = new RaopStreamProtocol(rtsp, streamContext);

    const settings: Settings = {
        protocols: {
            raop: {
                controlPort: 0,
                timingPort: 0
            }
        }
    };

    const streamClient = new StreamClient(context, rtsp, streamContext, protocol, settings);

    // Create properties from TXT record
    const properties = new Map<string, string>(Object.entries(discoveryResult.txt));

    console.log('\n🎵 Initializing stream...');
    await streamClient.initialize(properties);
    console.log('✅ Stream initialized');

    // Create audio source from file
    console.log('\n🎶 Loading audio file...');
    const audioSource = new FileAudioSource(
        new URL('./doorbell.ogg', import.meta.url).pathname,
        5  // Approximate duration in seconds - adjust as needed
    );
    await audioSource.start();

    const metadata: MediaMetadata = {
        title: 'Doorbell',
        artist: 'RAOP Test',
        album: 'Test Album',
        duration: 5
    };

    console.log('\n🔊 Streaming audio file...');

    streamClient.listener = {
        playing(playbackInfo) {
            console.log('▶️  Playing:', playbackInfo.metadata.title);
        },
        stopped() {
            console.log('⏹️  Stopped');
        }
    };

    try {
        await streamClient.sendAudio(audioSource, metadata);
        console.log('\n✅ Streaming complete!');
    } catch (err) {
        console.error('\n❌ Streaming error:', err);
    } finally {
        audioSource.stop();
    }

    await rtsp.disconnect();
    console.log('👋 Disconnected');
}

testRaop().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
