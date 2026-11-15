import { randomBytes } from 'node:crypto';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EncryptionError, SetupError } from '@corewire/core';
import { ChaCha20 } from '@corewire/core/crypto';
import { NTP, Plist } from '@corewire/core/encoding';
import type { Context } from '@corewire/core/transport';
import type { ControlChannel } from '../channels/control';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_FRAMES_PER_PACKET, AUDIO_SAMPLE_RATE } from '../const';
import { randomInt32, randomInt64 } from '../utils';
import { LatencyManager } from './latency';
import { streamWithTiming } from './pacing';
import type { AudioSource } from './source';
import { AudioSourceSession } from './sourceSession';

/** Latency in frames (0.25 seconds at 44,100 Hz), for silence padding at the end of the stream. */
const LATENCY_FRAMES = 11025;

/** Maximum number of packets to keep in the retransmission backlog. */
const PACKET_BACKLOG_SIZE = 1000;

/** Interval in milliseconds between RTCP sync packets. */
const SYNC_INTERVAL = 1000;

/** Default number of previous frames sent as RFC 2198 redundancy; 0 disables it. */
const DEFAULT_REDUNDANCY_COUNT = 0;

/** The audio session an {@link AudioStream} runs on: its control channel, after the audio-session SETUP and RECORD. */
export type AudioStreamTarget = {
    readonly context: Context;
    readonly control: ControlChannel;

    /** Receiver address for the UDP sockets. */
    readonly address: string;

    /** `supportedAudioFormats` from `/info`, only logged. */
    readonly supportedAudioFormats?: number;
};

export type AudioStreamOptions = {
    /** Previous frames to include as RFC 2198 redundancy. Defaults to 0, which disables redundancy. */
    readonly redundancyCount?: number;
};

/** Counters of an active audio stream, for feedback and adaptive redundancy. */
export type AudioStreamStats = {
    readonly packetsSent: number;
    readonly retransmitRequests: number;
    readonly retransmitsFulfilled: number;
    readonly retransmitsFailed: number;
    readonly packetLossRate: number;
    readonly totalBytesSent: number;
};

/** Compression types for SETUP `ct`. */
export const CompressionType = {
    PCM: 1,
    ALAC: 2,
    AAC_LC: 4,
    AAC_ELD: 8,
    Opus: 32
} as const;

/** SETUP `audioFormat` bits, named `{codec}_{sampleRate}_{bitDepth}_{channels}`. */
export const AudioFormat = {
    // PCM starts at bit 2; bits 0 and 1 are not PCM formats.
    PCM_8000_16_1: 0x4,
    PCM_8000_16_2: 0x8,
    PCM_16000_16_1: 0x10,
    PCM_16000_16_2: 0x20,
    PCM_24000_16_1: 0x40,
    PCM_24000_16_2: 0x80,
    PCM_32000_16_1: 0x100,
    PCM_32000_16_2: 0x200,
    PCM_44100_16_1: 0x400,
    PCM_44100_16_2: 0x800,
    PCM_44100_24_1: 0x1000,
    PCM_44100_24_2: 0x2000,
    PCM_48000_16_1: 0x4000,
    PCM_48000_16_2: 0x8000,
    PCM_48000_24_1: 0x10000,
    PCM_48000_24_2: 0x20000,
    ALAC_44100_16_2: 0x40000,
    ALAC_44100_24_2: 0x80000,
    ALAC_48000_16_2: 0x100000,
    ALAC_48000_24_2: 0x200000,
    AAC_LC_44100_2: 0x400000,
    AAC_LC_48000_2: 0x800000,
    AAC_ELD_44100_2: 0x1000000,
    AAC_ELD_48000_2: 0x2000000,
    AAC_ELD_16000_1: 0x4000000,
    AAC_ELD_24000_1: 0x8000000,
    AAC_ELD_48000_1: 0x100000000
} as const;

/** Created by {@link AudioStream.prepare} and updated per packet, also during multiroom streaming. */
export type AudioStreamContext = {
    /** Negotiated sample rate in Hz. */
    sampleRate: number;

    channels: number;

    /** Bytes per sample per channel. */
    bytesPerChannel: number;

    /** Bytes per frame: channels * bytesPerChannel. */
    frameSize: number;

    /** Bytes per packet: framesPerPacket * frameSize. */
    packetSize: number;

    /** RTP sequence number, wraps at 0xFFFF. */
    rtpSeq: number;

    /** RTP timestamp as a cumulative frame count. */
    rtpTime: number;

    /** Head timestamp of the current packet. */
    headTs: number;

    /** Latency in frames, for silence padding at the end of the stream. */
    latency: number;

    /** Silence frames sent so far. */
    paddingSent: number;

    totalFrames: number;
};

const USE_ENCRYPTION = true;

/** Converts an RTP timestamp to NTP against the wall-clock anchor taken at stream start, for multiroom sync. */
const rtpToNtp = (rtpTimestamp: number, sampleRate: number, anchorRtp: number, anchorNtp: bigint): bigint => {
    let elapsedSamples: number;

    if (rtpTimestamp >= anchorRtp) {
        elapsedSamples = rtpTimestamp - anchorRtp;
    } else {
        // 32-bit unsigned wrap
        elapsedSamples = (0x100000000 - anchorRtp) + rtpTimestamp;
    }

    const elapsedSeconds = Math.floor(elapsedSamples / sampleRate);
    const elapsedFraction = ((elapsedSamples % sampleRate) * 0xFFFFFFFF) / sampleRate;
    const elapsedNtp = (BigInt(elapsedSeconds) << 32n) | BigInt(Math.floor(elapsedFraction));

    return anchorNtp + elapsedNtp;
};

/**
 * Encrypted RTP audio over UDP with RTCP synchronization, NACK retransmission and optional RFC 2198 redundancy.
 * Call {@link setup}, then {@link prepare}, send frames and call {@link finish}, or use {@link stream} after setup.
 */
export class AudioStream {
    readonly #address: string;
    readonly #context: Context;
    readonly #control: ControlChannel;
    readonly #supportedFormats?: number;

    /** RFC 2198 redundancy count; 0 disables it. */
    #redundancyCount: number;

    #controlPort: number = 0;
    #source?: AudioSourceSession;
    #closed = false;

    /** UDP socket for RTCP control messages (sync, retransmit requests). */
    #controlSocket?: UdpSocket;

    /** 32-byte shared key for ChaCha20 audio encryption. */
    #sharedKey?: Buffer;

    /** Remote data port from the SETUP response. */
    #dataPort: number = 0;

    #dataSocket?: UdpSocket;
    #negotiatedBytesPerChannel: number = AUDIO_BYTES_PER_CHANNEL;
    #negotiatedSampleRate: number = AUDIO_SAMPLE_RATE;

    /** RTP timestamp of the NTP anchor. */
    #anchorRtp: number = 0;

    /** NTP timestamp of the anchor, for RTP to NTP conversion. */
    #anchorNtp: bigint = 0n;

    /** Previous frames kept for RFC 2198 redundancy. */
    #previousFrames: Buffer[] = [];

    /** Remote RTCP control port from the SETUP response. */
    #remoteControlPort: number = 0;

    /** Sent packets kept for retransmission on NACK, keyed by RTP sequence number. */
    #packetBacklog: Map<number, Buffer> = new Map();

    /** Random RTP synchronization source identifier. */
    #ssrc: number = 0;

    #syncInterval?: NodeJS.Timeout;
    #streamContext?: AudioStreamContext;
    #latencyManager?: LatencyManager;

    /** ChaCha20 nonce counter, independent of the RTP sequence number. */
    #encryptionCounter: number = 0;

    #packetsSent: number = 0;
    #retransmitRequests: number = 0;
    #retransmitsFulfilled: number = 0;
    #retransmitsFailed: number = 0;
    #totalBytesSent: number = 0;

    get stats(): AudioStreamStats {
        return {
            packetsSent: this.#packetsSent,
            retransmitRequests: this.#retransmitRequests,
            retransmitsFulfilled: this.#retransmitsFulfilled,
            retransmitsFailed: this.#retransmitsFailed,
            packetLossRate: this.#packetsSent > 0 ? this.#retransmitRequests / this.#packetsSent : 0,
            totalBytesSent: this.#totalBytesSent
        };
    }

    constructor(target: AudioStreamTarget, options?: AudioStreamOptions) {
        this.#address = target.address;
        this.#context = target.context;
        this.#control = target.control;
        this.#supportedFormats = target.supportedAudioFormats;
        this.#redundancyCount = options?.redundancyCount ?? DEFAULT_REDUNDANCY_COUNT;
    }

    /**
     * Negotiates PCM 44100/16/stereo and UDP ports via SETUP, then sends RECORD.
     *
     * @returns The assigned data and control ports.
     * @throws SetupError if SETUP fails or returns no stream info.
     */
    async setup(): Promise<{ dataPort: number; controlPort: number }> {
        if (this.#closed) throw new SetupError('Audio setup cancelled.');

        this.#sharedKey = Buffer.from(randomBytes(32));

        this.#ssrc = randomInt32() >>> 0;

        const socket = this.#controlSocket = createSocket('udp4');

        this.#controlSocket.on('message', (data, rinfo) => this.#onControlMessage(data, rinfo));

        await new Promise<void>((resolve, reject) => {
            const cleanup = (): void => {
                socket.off('error', fail);
                socket.off('close', closed);
            };

            const fail = (error: Error): void => {
                cleanup();
                reject(error);
            };

            const closed = (): void => fail(new SetupError('Audio setup cancelled.'));

            socket.once('error', fail);
            socket.once('close', closed);

            socket.bind(0, () => {
                cleanup();

                if (this.#closed) {
                    reject(new SetupError('Audio setup cancelled.'));

                    return;
                }

                this.#controlPort = socket.address().port;
                resolve();
            });
        });

        const shkArrayBuffer: ArrayBuffer = this.#sharedKey.buffer.slice(
            this.#sharedKey.byteOffset,
            this.#sharedKey.byteOffset + this.#sharedKey.byteLength
        ) as ArrayBuffer;

        // A random 64-bit stream connection ID, as iOS sends.
        const streamConnectionID = randomInt64();

        // SETUP takes the codec in `ct` and sample rate, bit depth and channel count in `audioFormat`.
        const supportedFormats = this.#supportedFormats;
        const ct = CompressionType.PCM;
        const audioFormat: number = AudioFormat.PCM_44100_16_2;
        const sampleRate = AUDIO_SAMPLE_RATE;

        if (supportedFormats) {
            this.#context.logger.info('[audio]', `Receiver supported formats: 0x${supportedFormats.toString(16)}`);
        }

        const bytesPerChannel = AUDIO_BYTES_PER_CHANNEL;

        const setupBody = Plist.serialize({
            streams: [{
                audioFormat,
                audioMode: 'default',
                controlPort: this.#controlPort,
                ct,
                isMedia: true,
                latencyMax: sampleRate * 2,
                latencyMin: Math.round(sampleRate * 0.25),
                shk: shkArrayBuffer,
                spf: AUDIO_FRAMES_PER_PACKET,
                sr: sampleRate,
                streamConnectionID,
                supportsDynamicStreamID: false,
                redundantAudio: this.#redundancyCount > 0,
                supportsRTPPacketRedundancy: this.#redundancyCount > 0,
                type: 0x60
            }]
        });

        this.#context.logger.debug('[audio]', 'Sending audio stream SETUP...');
        this.#context.logger.debug('[audio]', 'shk length:', this.#sharedKey.length);

        const response = await this.#control.setup(
            `/${this.#control.sessionId}`,
            Buffer.from(setupBody),
            {'Content-Type': 'application/x-apple-binary-plist'}
        );

        if (this.#closed) throw new SetupError('Audio setup cancelled.');

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

            this.#negotiatedSampleRate = sampleRate;
            this.#negotiatedBytesPerChannel = bytesPerChannel;
            this.#context.logger.info('[audio]', `Audio stream setup: dataPort=${this.#dataPort}, controlPort=${this.#remoteControlPort}, format=0x${audioFormat.toString(16)}, sr=${sampleRate}, bpc=${bytesPerChannel}`);
        } else {
            throw new SetupError('No stream info in SETUP response.');
        }

        this.#context.logger.debug('[audio]', 'Sending RECORD...');
        await this.#control.record(`/${this.#control.sessionId}`);

        if (this.#closed) throw new SetupError('Audio setup cancelled.');

        this.#context.logger.debug('[audio]', 'RECORD complete');

        return {
            dataPort: this.#dataPort,
            controlPort: this.#remoteControlPort
        };
    }

    /**
     * Connects the UDP data socket, creates the stream context, sends FLUSH
     * and starts RTCP sync.
     */
    async prepare(remoteAddress: string): Promise<AudioStreamContext> {
        if (!this.#controlSocket || !this.#sharedKey || !this.#dataPort) {
            throw new SetupError('Audio stream not setup.');
        }

        if (this.#closed) throw new SetupError('Audio preparation cancelled.');

        const socket = this.#dataSocket = createSocket('udp4');

        await new Promise<void>((resolve, reject) => {
            const cleanup = (): void => {
                socket.off('error', fail);
                socket.off('close', closed);
            };

            const fail = (error: Error): void => {
                cleanup();
                reject(error);
            };

            const closed = (): void => fail(new SetupError('Audio preparation cancelled.'));

            socket.once('error', fail);
            socket.once('close', closed);

            socket.connect(this.#dataPort, remoteAddress, () => {
                cleanup();
                this.#closed ? reject(new SetupError('Audio preparation cancelled.')) : resolve();
            });
        });

        const frameSize = AUDIO_CHANNELS * this.#negotiatedBytesPerChannel;
        const packetSize = AUDIO_FRAMES_PER_PACKET * frameSize;

        this.#latencyManager = new LatencyManager(this.#negotiatedSampleRate);

        const latency = this.#latencyManager.getLatency();
        const initialRtpTime = 0;

        // Receivers sync playback through this anchor of RTP to wall-clock NTP.
        this.#anchorRtp = initialRtpTime;
        this.#anchorNtp = NTP.now();

        const ctx: AudioStreamContext = {
            sampleRate: this.#negotiatedSampleRate,
            channels: AUDIO_CHANNELS,
            bytesPerChannel: this.#negotiatedBytesPerChannel,
            frameSize,
            packetSize,
            rtpSeq: randomInt32() & 0xFFFF,
            rtpTime: initialRtpTime,
            headTs: initialRtpTime,
            latency,
            paddingSent: 0,
            totalFrames: 0
        };

        this.#streamContext = ctx;

        this.#context.logger.debug('[audio]', 'Sending FLUSH...');

        await this.#control.flush(`/${this.#control.sessionId}`, {
            'Range': 'npt=0-',
            'RTP-Info': `seq=${ctx.rtpSeq};rtptime=${ctx.rtpTime}`
        });

        if (this.#closed) throw new SetupError('Audio preparation cancelled.');

        this.#context.logger.debug('[audio]', 'FLUSH complete');

        this.#context.logger.debug('[audio]', `RTP start: seq=${ctx.rtpSeq}, time=${ctx.rtpTime}, ssrc=${this.#ssrc}`);

        this.#packetBacklog.clear();
        this.#startSync();

        return ctx;
    }

    /**
     * Sends frames that were already read as one RTP packet. {@link AudioMultiplexer}
     * reads each packet once and sends it to every stream.
     *
     * @param frames - Raw PCM frame data.
     * @param firstPacket - Sets the RTP marker bit.
     * @returns Number of frames sent.
     * @throws SetupError if the stream has not been prepared.
     */
    async sendFrameData(frames: Buffer, firstPacket: boolean): Promise<number> {
        if (!this.#streamContext) {
            throw new SetupError('Audio stream not prepared.');
        }

        return this.#sendFrameBuffer(frames, firstPacket, this.#streamContext);
    }

    /** Pads with silence for the negotiated latency before TEARDOWN so the receiver can finish buffered audio. */
    async finish(): Promise<void> {
        if (!this.#streamContext) {
            return;
        }

        const ctx = this.#streamContext;
        const startFrames = ctx.totalFrames;
        const startTime = performance.now();

        while (ctx.paddingSent < ctx.latency) {
            const silence = Buffer.alloc(ctx.packetSize, 0);
            const sent = await this.#sendFrameBuffer(silence, false, ctx);

            if (sent === 0) {
                break;
            }

            ctx.paddingSent += sent;

            const expectedTime = (ctx.totalFrames - startFrames) / ctx.sampleRate * 1000;
            const actualTime = performance.now() - startTime;
            const sleepTime = expectedTime - actualTime;

            if (sleepTime > 0) {
                await this.#sleep(sleepTime);
            }
        }

        this.#stopSync();

        this.#context.logger.debug('[audio]', 'Sending TEARDOWN...');
        await this.#control.teardown(`/${this.#control.sessionId}`);
        this.#context.logger.debug('[audio]', 'TEARDOWN complete');
    }

    /**
     * Prepares, paces and finishes the stream, then closes it. Sends extra packets when behind schedule.
     *
     * @param remoteAddress - Receiver address for the UDP connection.
     */
    async stream(source: AudioSource, remoteAddress: string): Promise<void> {
        const session = new AudioSourceSession(source);

        this.#source = session;

        try {
            if (this.#closed) {
                return;
            }

            const ctx = await this.prepare(remoteAddress);

            if (this.#closed) {
                return;
            }

            await session.start();
            this.#context.logger.info('[audio]', 'Starting audio stream...');

            const packetCount = await streamWithTiming(
                (firstPacket) => this.#sendPacket(session, firstPacket, ctx),
                {
                    sampleRate: ctx.sampleRate,
                    logger: this.#context.logger,
                    logPrefix: '[audio]'
                }
            );

            this.#context.logger.info('[audio]', `Audio stream finished, sent ${packetCount} packets`);

            this.#stopSync();

            this.#context.logger.debug('[audio]', 'Sending TEARDOWN...');
            await this.#control.teardown(`/${this.#control.sessionId}`);
            this.#context.logger.debug('[audio]', 'TEARDOWN complete');
        } finally {
            // close() does not wait for the source to stop, so a source that hangs on stop cannot hold
            // up the teardown. A caller that needs the stop awaits it itself.
            this.close();

            if (this.#source === session) {
                this.#source = undefined;
            }
        }
    }

    /**
     * Reads frames from the source and sends them as one RTP packet. Once the
     * source is exhausted, it sends silence until the latency is padded.
     *
     * @param firstPacket - Sets the RTP marker bit.
     * @param ctx - Stream context with the RTP state, updated in place.
     * @returns Number of frames sent, or 0 when all padding has been sent.
     */
    async #sendPacket(source: AudioSource, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        if (this.#closed || ctx.paddingSent >= ctx.latency) {
            return 0;
        }

        let frames = await source.readFrames(AUDIO_FRAMES_PER_PACKET);

        if (this.#closed) {
            return 0;
        }

        if (!frames || frames.length === 0) {
            frames = Buffer.alloc(ctx.packetSize, 0);
            ctx.paddingSent += Math.floor(frames.length / ctx.frameSize);
        } else if (frames.length < ctx.packetSize) {
            const padded = Buffer.alloc(ctx.packetSize, 0);

            frames.copy(padded);
            frames = padded;
        }

        return this.#sendFrameBuffer(frames, firstPacket, ctx);
    }

    /**
     * Builds encrypted RTP packets with optional RFC 2198 redundancy and retains them for retransmission.
     *
     * @param frames - PCM data, `packetSize` bytes.
     * @param firstPacket - Sets the RTP marker bit.
     * @returns Number of frames sent.
     */
    #sendFrameBuffer(frames: Buffer, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        const hasRedundancy = this.#redundancyCount > 0 && this.#previousFrames.length > 0;
        const pt = hasRedundancy ? 0x61 : 0x60; // PT 97 for RFC 2198, PT 96 otherwise

        const rtpHeader = Buffer.allocUnsafe(12);

        rtpHeader.writeUInt8(0x80, 0);  // Version 2
        rtpHeader.writeUInt8(firstPacket ? (pt | 0x80) : pt, 1);  // Marker + PT
        rtpHeader.writeUInt16BE(ctx.rtpSeq, 2);
        rtpHeader.writeUInt32BE(ctx.headTs >>> 0, 4);
        rtpHeader.writeUInt32BE(this.#ssrc, 8);

        // RFC 2198 payload: [redundant headers, 4 bytes each] [primary header, 1 byte] [redundant data...] [primary data]
        let audioPayload: Buffer;

        if (hasRedundancy) {
            const redundantFrames = this.#previousFrames.slice(-this.#redundancyCount);
            const headers: Buffer[] = [];

            for (let i = 0; i < redundantFrames.length; i++) {
                const level = redundantFrames.length - i;
                const tsOffset = level * AUDIO_FRAMES_PER_PACKET;
                const blockLen = redundantFrames[i].length;
                const header = Buffer.allocUnsafe(4);

                // F(1) | PT(7) | timestamp offset(14) | block length(10)
                header[0] = 0x80 | 96;                            // F=1, PT=96
                header[1] = ((tsOffset >> 6) & 0xFF);             // timestamp offset high 8 bits
                header[2] = ((tsOffset & 0x3F) << 2) | ((blockLen >> 8) & 0x03); // ts low 6 + len high 2
                header[3] = blockLen & 0xFF;                       // block length low 8 bits

                headers.push(header);
            }

            // Primary block header: F=0, PT=96, 1 byte.
            headers.push(Buffer.from([96]));

            audioPayload = Buffer.concat([...headers, ...redundantFrames, frames]);
        } else {
            audioPayload = frames;
        }

        this.#previousFrames.push(Buffer.from(frames));

        if (this.#previousFrames.length > this.#redundancyCount) {
            this.#previousFrames.shift();
        }

        // The AAD is bytes 4 to 12 of the RTP header: timestamp and SSRC.
        const aad = rtpHeader.subarray(4, 12);

        const payload = USE_ENCRYPTION
            ? this.#encryptAudio(audioPayload, aad, this.#encryptionCounter++)
            : audioPayload;

        const packet = Buffer.concat([rtpHeader, payload]);

        this.#storePacket(ctx.rtpSeq, packet);

        const framesSent = Math.floor(frames.length / ctx.frameSize);

        ctx.rtpSeq = (ctx.rtpSeq + 1) & 0xFFFF;
        ctx.headTs = (ctx.headTs + framesSent) >>> 0;
        ctx.totalFrames += framesSent;

        return this.#send(packet).then(() => {
            this.#packetsSent++;
            this.#totalBytesSent += packet.length;
            this.#latencyManager?.reportSuccess();

            // With redundancy enabled, follow the latency tier every 50 packets.
            if (this.#redundancyCount > 0 && this.#latencyManager && this.#packetsSent % 50 === 0) {
                const recommended = this.#latencyManager.recommendedRedundancy;

                if (recommended !== this.#redundancyCount) {
                    this.#context.logger.debug('[audio]', `Adjusting redundancy: ${this.#redundancyCount} → ${recommended}`);
                    this.#redundancyCount = recommended;
                }
            }

            return framesSent;
        });
    }

    /** Keeps a sent packet for retransmission and drops the oldest past {@link PACKET_BACKLOG_SIZE}. */
    #storePacket(seqno: number, packet: Buffer): void {
        this.#packetBacklog.set(seqno, packet);

        if (this.#packetBacklog.size > PACKET_BACKLOG_SIZE) {
            const oldestKey = this.#packetBacklog.keys().next().value;

            if (oldestKey !== undefined) {
                this.#packetBacklog.delete(oldestKey);
            }
        }
    }

    /**
     * Returns a sent packet from the retransmission backlog.
     *
     * @returns The RTP packet with its header, or undefined once it left the backlog.
     */
    getPacket(seqno: number): Buffer | undefined {
        return this.#packetBacklog.get(seqno);
    }

    /**
     * Encrypts an audio payload with ChaCha20-Poly1305 and the shared key. The
     * 12-byte nonce holds the counter little-endian at offset 4.
     *
     * @param aad - RTP header bytes 4 to 12: timestamp and SSRC.
     * @param seqNumber - Nonce counter.
     * @returns Ciphertext, auth tag and the 8-byte nonce trailer.
     * @throws EncryptionError if encryption has not been set up.
     */
    #encryptAudio(data: Buffer, aad: Buffer, seqNumber: number): Buffer {
        if (!this.#sharedKey) {
            throw new EncryptionError('Encryption not setup.');
        }

        const nonceBytes = Buffer.alloc(12, 0);

        nonceBytes.writeUInt32LE(seqNumber, 4);

        const result = ChaCha20.encrypt(
            this.#sharedKey,
            nonceBytes,
            aad,
            data
        );

        // The nonce trailer is the 8 bytes that hold the little-endian counter.
        const nonceTrailer = nonceBytes.subarray(4, 12);

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

    /**
     * Starts the periodic RTCP sync packets (type 0xD4). Each one tells the
     * receiver our current RTP timestamp and its NTP wall-clock time; the
     * first has the marker bit set.
     */
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
            const currentTime = rtpToNtp(ctx.headTs, ctx.sampleRate, this.#anchorRtp, this.#anchorNtp);
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

            this.#controlSocket.send(packet, this.#remoteControlPort, this.#address, (err) => {
                if (err) {
                    this.#context.logger.warn('[audio]', 'Sync packet send failed', err);
                }
            });
        };

        sendSync();
        this.#syncInterval = setInterval(sendSync, SYNC_INTERVAL);
    }

    /** Stops the RTCP sync packets and clears the stream context. */
    #stopSync(): void {
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
            this.#syncInterval = undefined;
        }

        this.#streamContext = undefined;
    }

    /**
     * Handles an RTCP control message from the receiver. Only type 0x55, a
     * retransmit request (NACK), is handled.
     */
    #onControlMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        if (data.length < 8 || (data[0] >> 6) !== 2 || rinfo.address !== this.#address || rinfo.port !== this.#remoteControlPort) {
            return;
        }

        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitPackets(data, rinfo);
        }
    }

    /**
     * Answers a NACK by resending each requested packet from the backlog in a
     * retransmit response (type 0xD6). A packet that left the backlog gets an
     * empty response, so the receiver stops waiting for it.
     *
     * @param data - NACK packet with the first sequence number and the count.
     */
    #retransmitPackets(data: Buffer, addr: { address: string; port: number }): void {
        const lostSeqno = data.readUInt16BE(4);
        const lostPackets = Math.min(data.readUInt16BE(6), 512);

        // Every NACK counts as a glitch.
        this.#latencyManager?.reportGlitch();

        this.#retransmitRequests += lostPackets;

        for (let i = 0; i < lostPackets; i++) {
            const seqno = (lostSeqno + i) & 0xFFFF;
            const packet = this.#packetBacklog.get(seqno);

            if (packet) {
                const originalSeqno = packet.subarray(2, 4);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), originalSeqno, packet]);

                this.#controlSocket?.send(resp, addr.port, addr.address);
                this.#retransmitsFulfilled++;
            } else {
                const seqBuf = Buffer.alloc(2);

                seqBuf.writeUInt16BE(seqno);

                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), seqBuf, Buffer.alloc(4)]);

                this.#controlSocket?.send(resp, addr.port, addr.address);
                this.#retransmitsFailed++;
            }
        }
    }

    /**
     * Stops the sync packets, closes both UDP sockets and clears the
     * retransmission backlog. Safe to call more than once.
     */
    close(): void {
        this.#closed = true;
        void this.#source?.stop().catch(error => this.#context.logger.error('[audio]', 'Source cleanup failed', error));
        this.#stopSync();

        try {
            this.#controlSocket?.removeAllListeners();
            this.#controlSocket?.close();
        } catch {
        }

        this.#controlSocket = undefined;

        try {
            this.#dataSocket?.close();
        } catch {
        }

        this.#dataSocket = undefined;

        this.#packetBacklog.clear();
    }
}
