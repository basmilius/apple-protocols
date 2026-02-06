import type { Socket as UdpSocket } from 'node:dgram';
import { readFileSync } from 'node:fs';
import { Context, Discovery, reporter } from '@basmilius/apple-common';
import { type MediaMetadata, RtspClient, type Settings, StreamClient, type StreamContext, type StreamProtocol } from './src';
import * as AudioSource from '../audio-source/dist';

reporter.all();

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;
const FRAMES_PER_PACKET = 352;

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
    const discoveryResult = await discovery.findUntil('Woonkamer-HomePod.local');

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
    // const audioSource = new AudioSource.Ffmpeg(new URL('../../doorbell.ogg', import.meta.url).pathname, 5);
    // await audioSource.start();

    const audioSource = new AudioSource.Ffmpeg(new URL('../../olympics.mp3', import.meta.url).pathname, 5);
    await audioSource.start();

    // const audioSource = await AudioSource.Mp3.fromBuffer(readFileSync('../../olympics.mp3'));

    const metadata: MediaMetadata = {
        title: 'Olympics',
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
        await streamClient.sendAudio(audioSource, metadata, 25);
        console.log('\n✅ Streaming complete!');
    } catch (err) {
        console.error('\n❌ Streaming error:', err);
    } finally {
        await audioSource.stop();
    }

    await rtsp.disconnect();
    console.log('👋 Disconnected');
}

testRaop().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
