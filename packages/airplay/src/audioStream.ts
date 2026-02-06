import { getRandomValues } from 'node:crypto';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { type AudioSource, type Context, randomInt32, randomInt64 } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import type Protocol from './protocol';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;
const FRAMES_PER_PACKET = 352;
const LATENCY_FRAMES = 11025;
const PACKET_BACKLOG_SIZE = 1000;

// Audio formats:
// 262144 (0x40000) = AAC-ELD (what iOS uses, requires encoding)
// 4194304 (0x400000) = PCM 44100/16/2 (raw PCM, big-endian)
const AUDIO_FORMAT_AAC_ELD = 262144;
const AUDIO_FORMAT_PCM = 4194304;

// Use PCM for now since we're sending raw PCM data
const AUDIO_FORMAT = AUDIO_FORMAT_PCM;

type AudioStreamContext = {
    sampleRate: number;
    channels: number;
    bytesPerChannel: number;
    frameSize: number;
    packetSize: number;
    rtpSeq: number;
    rtpTime: number;
    headTs: number;
    latency: number;
    paddingSent: number;
}

const USE_ENCRYPTION = true;

export default class AudioStream {
    readonly #protocol: Protocol;
    readonly #context: Context;

    #controlPort: number = 0;
    #controlSocket?: UdpSocket;
    #sharedKey?: Buffer;
    #dataPort: number = 0;
    #dataSocket?: UdpSocket;
    #remoteControlPort: number = 0;
    #packetBacklog: Map<number, Buffer> = new Map();
    #ssrc: number = 0;

    constructor(protocol: Protocol) {
        this.#protocol = protocol;
        this.#context = protocol.context;
    }

    async setup(): Promise<{ dataPort: number; controlPort: number }> {
        this.#sharedKey = Buffer.alloc(32);
        getRandomValues(this.#sharedKey);

        // Generate random SSRC
        this.#ssrc = randomInt32() >>> 0;

        // Create local UDP socket for control (RTCP)
        this.#controlSocket = createSocket('udp4');
        await new Promise<void>((resolve) => {
            this.#controlSocket!.bind(0, () => {
                this.#controlPort = this.#controlSocket!.address().port;
                resolve();
            });
        });

        const shkArrayBuffer: ArrayBuffer = this.#sharedKey.buffer.slice(
            this.#sharedKey.byteOffset,
            this.#sharedKey.byteOffset + this.#sharedKey.byteLength
        ) as ArrayBuffer;

        // Generate a random 64-bit stream connection ID like iOS does
        const streamConnectionID = randomInt64();

        const setupBody = Plist.serialize({
            streams: [{
                audioFormat: AUDIO_FORMAT,
                audioMode: 'moviePlayback',
                ct: USE_ENCRYPTION ? 2 : 0,
                isMedia: true,
                latencyMax: 88200,
                latencyMin: 11025,
                shk: shkArrayBuffer,
                spf: FRAMES_PER_PACKET,
                sr: SAMPLE_RATE,
                streamConnectionID,
                supportsDynamicStreamID: false,
                type: 96,
                streamConnections: {
                    streamConnectionTypeRTP: {
                        streamConnectionKeyUseStreamEncryptionKey: true
                    },
                    streamConnectionTypeRTCP: {
                        streamConnectionKeyPort: this.#controlPort
                    }
                }
            }]
        });

        this.#context.logger.debug('[audio]', 'Sending audio stream SETUP...');
        this.#context.logger.debug('[audio]', 'shk length:', this.#sharedKey.length);

        const response = await this.#protocol.controlStream.setup(
            `/${this.#protocol.controlStream.sessionId}`,
            Buffer.from(setupBody),
            {'Content-Type': 'application/x-apple-binary-plist'}
        );

        if (response.status !== 200) {
            const text = await response.text();
            throw new Error(`Failed to setup audio stream: ${response.status} - ${text}`);
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        this.#context.logger.debug('[audio]', 'Setup stream response:', plist);

        if (plist.streams && plist.streams.length > 0) {
            const streamInfo = plist.streams[0];
            const connections = streamInfo.streamConnections;

            // Get ports from the new response format
            this.#dataPort = connections?.streamConnectionTypeRTP?.streamConnectionKeyPort & 0xFFFF;
            this.#remoteControlPort = connections?.streamConnectionTypeRTCP?.streamConnectionKeyPort & 0xFFFF;

            this.#context.logger.info('[audio]', `Audio stream setup: rtpPort=${this.#dataPort}, rtcpPort=${this.#remoteControlPort}`);
        } else {
            throw new Error('No stream info in SETUP response');
        }

        this.#context.logger.debug('[audio]', 'Sending RECORD...');
        await this.#protocol.controlStream.record(`/${this.#protocol.controlStream.sessionId}`);
        this.#context.logger.debug('[audio]', 'RECORD complete');

        return {
            dataPort: this.#dataPort,
            controlPort: this.#remoteControlPort
        };
    }

    async stream(source: AudioSource, remoteAddress: string): Promise<void> {
        if (!this.#controlSocket || !this.#sharedKey || !this.#dataPort) {
            throw new Error('Audio stream not setup');
        }

        this.#dataSocket = createSocket('udp4');

        await new Promise<void>((resolve, reject) => {
            this.#dataSocket!.on('error', reject);
            this.#dataSocket!.connect(this.#dataPort, remoteAddress, resolve);
        });

        const frameSize = CHANNELS * BYTES_PER_CHANNEL;
        const packetSize = FRAMES_PER_PACKET * frameSize;

        const ctx: AudioStreamContext = {
            sampleRate: SAMPLE_RATE,
            channels: CHANNELS,
            bytesPerChannel: BYTES_PER_CHANNEL,
            frameSize,
            packetSize,
            rtpSeq: randomInt32() & 0xFFFF,
            rtpTime: randomInt32() >>> 0,
            headTs: 0,
            latency: LATENCY_FRAMES,
            paddingSent: 0
        };

        ctx.headTs = ctx.rtpTime;

        // this.#context.logger.debug('[audio]', 'Sending FLUSH...');
        // await this.#protocol.controlStream.flush(`/${this.#protocol.controlStream.sessionId}`, {
        //     'Range': 'npt=0-',
        //     'RTP-Info': `seq=${ctx.rtpSeq};rtptime=${ctx.rtpTime}`
        // });
        // this.#context.logger.debug('[audio]', 'FLUSH complete');

        let firstPacket = true;
        let packetCount = 0;
        const startTime = performance.now();

        this.#context.logger.info('[audio]', 'Starting audio stream...');
        this.#context.logger.debug('[audio]', `RTP start: seq=${ctx.rtpSeq}, time=${ctx.rtpTime}, ssrc=${this.#ssrc}`);

        // Clear packet backlog
        this.#packetBacklog.clear();

        while (true) {
            const framesSent = await this.#sendPacket(source, firstPacket, ctx);

            if (framesSent === 0) {
                this.#context.logger.debug('[audio]', `End of audio stream after ${packetCount} packets (padding complete)`);
                break;
            }

            packetCount++;
            firstPacket = false;

            if (packetCount % 100 === 0) {
                this.#context.logger.debug('[audio]', `Sent ${packetCount} packets`);
            }

            const expectedTime = (ctx.headTs - ctx.rtpTime) / SAMPLE_RATE * 1000;
            const actualTime = performance.now() - startTime;
            const sleepTime = expectedTime - actualTime;

            if (sleepTime > 0) {
                await this.#sleep(sleepTime);
            }
        }

        this.#context.logger.info('[audio]', `Audio stream finished, sent ${packetCount} packets`);

        // this.#context.logger.debug('[audio]', 'Sending TEARDOWN...');
        // await this.#protocol.controlStream.teardown(`/${this.#protocol.controlStream.sessionId}`);
    }

    async #sendPacket(source: AudioSource, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        // Check if we've sent all padding (latency frames after audio ends)
        if (ctx.paddingSent >= ctx.latency) {
            return 0;
        }

        // Read frames from source
        let frames = await source.readframes(FRAMES_PER_PACKET);

        if (!frames || frames.length === 0) {
            // No more audio data - send padding (silent frames)
            frames = Buffer.alloc(ctx.packetSize, 0);
            ctx.paddingSent += Math.floor(frames.length / ctx.frameSize);
        } else if (frames.length < ctx.packetSize) {
            // Pad last packet with zeros
            const padded = Buffer.alloc(ctx.packetSize, 0);
            frames.copy(padded);
            frames = padded;
        }

        // Build RTP header (12 bytes)
        const rtpHeader = Buffer.alloc(12);
        rtpHeader.writeUInt8(0x80, 0);  // Version 2
        rtpHeader.writeUInt8(firstPacket ? 0xE0 : 0x60, 1);  // Marker + PT 96
        rtpHeader.writeUInt16BE(ctx.rtpSeq, 2);
        rtpHeader.writeUInt32BE(ctx.headTs >>> 0, 4);
        rtpHeader.writeUInt32BE(this.#ssrc, 8);  // Use random SSRC

        // AAD is bytes 4-12 of RTP header (timestamp + SSRC)
        const aad = rtpHeader.subarray(4, 12);

        const payload = USE_ENCRYPTION
            ? this.#encryptAudio(frames, aad, ctx.rtpSeq)
            : frames;

        const packet = Buffer.concat([rtpHeader, payload]);

        // Store for potential retransmission
        this.#storePacket(ctx.rtpSeq, packet);

        await this.#send(packet);

        // Update context
        ctx.rtpSeq = (ctx.rtpSeq + 1) & 0xFFFF;
        ctx.headTs = (ctx.headTs + FRAMES_PER_PACKET) >>> 0;

        return Math.floor(frames.length / ctx.frameSize);
    }

    #storePacket(seqno: number, packet: Buffer): void {
        this.#packetBacklog.set(seqno, packet);

        // Limit backlog size by removing oldest entries
        if (this.#packetBacklog.size > PACKET_BACKLOG_SIZE) {
            const oldestKey = this.#packetBacklog.keys().next().value;
            if (oldestKey !== undefined) {
                this.#packetBacklog.delete(oldestKey);
            }
        }
    }

    getPacket(seqno: number): Buffer | undefined {
        return this.#packetBacklog.get(seqno);
    }

    #encryptAudio(data: Buffer, aad: Buffer, seqNumber: number): Buffer {
        if (!this.#sharedKey) {
            throw new Error('Encryption not setup');
        }

        // Build 12-byte nonce with sequence number in little-endian at the end
        const nonceBytes = Buffer.alloc(12, 0);
        // Write the sequence number as little-endian 64-bit at offset 4
        nonceBytes.writeUInt32LE(seqNumber, 4);

        const result = Chacha20.encrypt(
            this.#sharedKey,
            nonceBytes,
            aad,
            data
        );

        // Nonce trailer is just the 8 bytes containing the counter (little-endian)
        const nonceTrailer = nonceBytes.subarray(4, 12);

        // Return: encrypted audio + auth tag + nonce trailer
        return Buffer.concat([result.ciphertext, result.authTag, nonceTrailer]);
    }

    #send(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#dataSocket.send(data, err => err ? reject(err) : resolve());
        });
    }

    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close(): void {
        this.#controlSocket?.close();
        this.#controlSocket = undefined;
        this.#dataSocket?.close();
        this.#dataSocket = undefined;
        this.#packetBacklog.clear();
    }
}
