import { randomBytes } from 'node:crypto';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { type AudioSource, type Context, EncryptionError, randomInt32, randomInt64, SetupError } from '@basmilius/apple-common';
import { NTP, Plist } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import type Protocol from './protocol';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_CHANNEL = 2;
const FRAMES_PER_PACKET = 352;
const LATENCY_FRAMES = 11025;
const PACKET_BACKLOG_SIZE = 1000;
const SYNC_INTERVAL = 1000;
const MAX_PACKETS_COMPENSATE = 3;
const SLOW_WARNING_THRESHOLD = 5;

// Audio formats:
// 262_144 (0x40000) = AAC-ELD (what iOS uses, requires encoding)
// 4_194_304 (0x400000) = PCM 44100/16/2 (raw PCM, big-endian)
const AUDIO_FORMAT_PCM = 4194304;
const AUDIO_FORMAT = AUDIO_FORMAT_PCM;

export type AudioStreamContext = {
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
    totalFrames: number;
};

const USE_ENCRYPTION = true;

const ntpFromTs = (timestamp: number, sampleRate: number): bigint => {
    const seconds = Math.floor(timestamp / sampleRate);
    const fraction = ((timestamp % sampleRate) * 0xFFFFFFFF) / sampleRate;

    return (BigInt(seconds) << 32n) | BigInt(Math.floor(fraction));
};

export { FRAMES_PER_PACKET, SAMPLE_RATE };

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
    #syncInterval?: NodeJS.Timeout;
    #streamContext?: AudioStreamContext;

    constructor(protocol: Protocol) {
        this.#protocol = protocol;
        this.#context = protocol.context;
    }

    async setup(): Promise<{ dataPort: number; controlPort: number }> {
        this.#sharedKey = Buffer.from(randomBytes(32));

        // Generate random SSRC
        this.#ssrc = randomInt32() >>> 0;

        // Create local UDP socket for control (RTCP)
        this.#controlSocket = createSocket('udp4');
        this.#controlSocket.on('message', (data, rinfo) => this.#onControlMessage(data, rinfo));

        await new Promise<void>((resolve, reject) => {
            this.#controlSocket!.once('error', reject);
            this.#controlSocket!.bind(0, () => {
                this.#controlSocket!.removeListener('error', reject);
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
                audioFormat: 0x800,
                audioMode: 'default',
                controlPort: this.#controlPort,
                ct: 1,
                isMedia: true,
                latencyMax: 88200,
                latencyMin: 11025,
                shk: shkArrayBuffer,
                spf: FRAMES_PER_PACKET,
                sr: SAMPLE_RATE,
                streamConnectionID,
                supportsDynamicStreamID: false,
                type: 0x60
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
            throw new SetupError(`Failed to setup audio stream: ${response.status} - ${text}`);
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        this.#context.logger.debug('[audio]', 'Setup stream response:', plist);

        if (plist.streams && plist.streams.length > 0) {
            const streamInfo = plist.streams[0];

            this.#dataPort = streamInfo.dataPort & 0xFFFF;
            this.#remoteControlPort = streamInfo.controlPort & 0xFFFF;

            this.#context.logger.info('[audio]', `Audio stream setup: dataPort=${this.#dataPort}, controlPort=${this.#remoteControlPort}`);
        } else {
            throw new SetupError('No stream info in SETUP response.');
        }

        this.#context.logger.debug('[audio]', 'Sending RECORD...');
        await this.#protocol.controlStream.record(`/${this.#protocol.controlStream.sessionId}`);
        this.#context.logger.debug('[audio]', 'RECORD complete');

        return {
            dataPort: this.#dataPort,
            controlPort: this.#remoteControlPort
        };
    }

    /**
     * Prepare the audio stream for sending. Connects the UDP data socket,
     * initializes stream context, sends FLUSH, and starts RTCP sync.
     */
    async prepare(remoteAddress: string): Promise<AudioStreamContext> {
        if (!this.#controlSocket || !this.#sharedKey || !this.#dataPort) {
            throw new SetupError('Audio stream not setup.');
        }

        this.#dataSocket = createSocket('udp4');

        await new Promise<void>((resolve, reject) => {
            this.#dataSocket!.once('error', reject);
            this.#dataSocket!.connect(this.#dataPort, remoteAddress, () => {
                this.#dataSocket!.removeListener('error', reject);
                resolve();
            });
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
            rtpTime: 0,
            headTs: 0,
            latency: LATENCY_FRAMES,
            paddingSent: 0,
            totalFrames: 0
        };
        this.#streamContext = ctx;

        this.#context.logger.debug('[audio]', 'Sending FLUSH...');
        await this.#protocol.controlStream.flush(`/${this.#protocol.controlStream.sessionId}`, {
            'Range': 'npt=0-',
            'RTP-Info': `seq=${ctx.rtpSeq};rtptime=${ctx.rtpTime}`
        });
        this.#context.logger.debug('[audio]', 'FLUSH complete');

        this.#context.logger.debug('[audio]', `RTP start: seq=${ctx.rtpSeq}, time=${ctx.rtpTime}, ssrc=${this.#ssrc}`);

        this.#packetBacklog.clear();
        this.#startSync();

        return ctx;
    }

    /**
     * Send pre-read frame data as an RTP packet. Used by AudioMultiplexer
     * for multi-room streaming where frames are read once and sent to
     * multiple streams.
     */
    async sendFrameData(frames: Buffer, firstPacket: boolean): Promise<number> {
        if (!this.#streamContext) {
            throw new SetupError('Audio stream not prepared.');
        }

        return this.#sendFrameBuffer(frames, firstPacket, this.#streamContext);
    }

    /**
     * Send padding frames (silence) after audio ends and TEARDOWN.
     */
    async finish(): Promise<void> {
        if (!this.#streamContext) {
            return;
        }

        const ctx = this.#streamContext;

        // Send padding (latency worth of silence).
        while (ctx.paddingSent < ctx.latency) {
            const silence = Buffer.alloc(ctx.packetSize, 0);
            const sent = await this.#sendFrameBuffer(silence, false, ctx);

            if (sent === 0) {
                break;
            }

            ctx.paddingSent += sent;

            const expectedTime = ctx.totalFrames / SAMPLE_RATE * 1000;
            const actualTime = performance.now();
            const sleepTime = expectedTime - actualTime;

            if (sleepTime > 0) {
                await this.#sleep(sleepTime);
            }
        }

        this.#stopSync();

        this.#context.logger.debug('[audio]', 'Sending TEARDOWN...');
        await this.#protocol.controlStream.teardown(`/${this.#protocol.controlStream.sessionId}`);
        this.#context.logger.debug('[audio]', 'TEARDOWN complete');
    }

    /**
     * Stream audio from a source. Convenience method that uses prepare(),
     * sendFrameData() and finish() internally.
     */
    async stream(source: AudioSource, remoteAddress: string): Promise<void> {
        const ctx = await this.prepare(remoteAddress);

        try {
            let firstPacket = true;
            let packetCount = 0;
            let slowCount = 0;
            const startTime = performance.now();

            this.#context.logger.info('[audio]', 'Starting audio stream...');

            while (true) {
                const framesSent = await this.#sendPacket(source, firstPacket, ctx);

                if (framesSent === 0) {
                    this.#context.logger.debug('[audio]', `End of audio stream after ${packetCount} packets (padding complete)`);
                    break;
                }

                packetCount++;
                firstPacket = false;

                if (packetCount % 100 === 0) {
                    this.#context.logger.debug('[audio]', `Sent ${packetCount} packets, ${ctx.totalFrames} frames`);
                }

                const expectedTime = ctx.totalFrames / SAMPLE_RATE * 1000;
                const actualTime = performance.now() - startTime;
                const sleepTime = expectedTime - actualTime;

                if (sleepTime > 0) {
                    slowCount = 0;
                    await this.#sleep(sleepTime);
                } else {
                    // We're behind schedule — send extra packets to catch up.
                    const framesBehind = Math.floor((-sleepTime / 1000) * SAMPLE_RATE);

                    if (framesBehind >= FRAMES_PER_PACKET) {
                        const extraPackets = Math.min(
                            Math.floor(framesBehind / FRAMES_PER_PACKET),
                            MAX_PACKETS_COMPENSATE
                        );

                        for (let i = 0; i < extraPackets; i++) {
                            const extra = await this.#sendPacket(source, false, ctx);

                            if (extra === 0) {
                                break;
                            }

                            packetCount++;
                        }
                    }

                    slowCount++;

                    if (slowCount >= SLOW_WARNING_THRESHOLD) {
                        this.#context.logger.warn('[audio]', `Stream is behind schedule (${slowCount} consecutive slow packets, ${Math.abs(sleepTime).toFixed(1)}ms behind)`);
                        slowCount = 0;
                    }
                }
            }

            this.#context.logger.info('[audio]', `Audio stream finished, sent ${packetCount} packets`);

            this.#stopSync();

            this.#context.logger.debug('[audio]', 'Sending TEARDOWN...');
            await this.#protocol.controlStream.teardown(`/${this.#protocol.controlStream.sessionId}`);
            this.#context.logger.debug('[audio]', 'TEARDOWN complete');
        } catch (err) {
            this.#stopSync();
            this.#dataSocket?.close();
            this.#dataSocket = undefined;
            this.#packetBacklog.clear();

            throw err;
        }
    }

    async #sendPacket(source: AudioSource, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        // Check if we've sent all padding (latency frames after audio ends)
        if (ctx.paddingSent >= ctx.latency) {
            return 0;
        }

        // Read frames from source
        let frames = await source.readFrames(FRAMES_PER_PACKET);

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

        return this.#sendFrameBuffer(frames, firstPacket, ctx);
    }

    #sendFrameBuffer(frames: Buffer, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        // Build RTP header (12 bytes)
        const rtpHeader = Buffer.allocUnsafe(12);
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

        // Update context
        const framesSent = Math.floor(frames.length / ctx.frameSize);
        ctx.rtpSeq = (ctx.rtpSeq + 1) & 0xFFFF;
        ctx.headTs = (ctx.headTs + framesSent) >>> 0;
        ctx.totalFrames += framesSent;

        return this.#send(packet).then(() => framesSent);
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
            throw new EncryptionError('Encryption not setup.');
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
            this.#dataSocket!.send(data, err => err ? reject(err) : resolve());
        });
    }

    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    #startSync(): void {
        if (this.#syncInterval) {
            return;
        }

        let firstPacket = true;

        const sendSync = () => {
            if (!this.#controlSocket || !this.#streamContext || !this.#remoteControlPort) {
                return;
            }

            const ctx = this.#streamContext;
            const currentTime = ntpFromTs(ctx.headTs, ctx.sampleRate);
            const [currentSec, currentFrac] = NTP.parts(currentTime);

            const packet = Buffer.allocUnsafe(20);
            packet.writeUInt8(firstPacket ? 0x90 : 0x80, 0);
            packet.writeUInt8(0xD4, 1);
            packet.writeUInt16BE(0x0007, 2);
            packet.writeUInt32BE((ctx.headTs - ctx.latency) >>> 0, 4);
            packet.writeUInt32BE(currentSec, 8);
            packet.writeUInt32BE(currentFrac, 12);
            packet.writeUInt32BE(ctx.headTs >>> 0, 16);

            firstPacket = false;

            this.#controlSocket.send(packet, this.#remoteControlPort, this.#protocol.discoveryResult.address);
        };

        sendSync();
        this.#syncInterval = setInterval(sendSync, SYNC_INTERVAL);
    }

    #stopSync(): void {
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
            this.#syncInterval = undefined;
        }

        this.#streamContext = undefined;
    }

    #onControlMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitPackets(data, rinfo);
        }
    }

    #retransmitPackets(data: Buffer, addr: { address: string; port: number }): void {
        const lostSeqno = data.readUInt16BE(4);
        const lostPackets = data.readUInt16BE(6);

        for (let i = 0; i < lostPackets; i++) {
            const seqno = (lostSeqno + i) & 0xFFFF;
            const packet = this.#packetBacklog.get(seqno);

            if (packet) {
                const originalSeqno = packet.subarray(2, 4);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), originalSeqno, packet]);

                this.#controlSocket?.send(resp, addr.port, addr.address);
            }
        }
    }

    close(): void {
        this.#stopSync();
        this.#controlSocket?.close();
        this.#controlSocket = undefined;
        this.#dataSocket?.close();
        this.#dataSocket = undefined;
        this.#packetBacklog.clear();
    }
}
