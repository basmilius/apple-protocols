import { randomBytes } from 'node:crypto';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { type AudioSource, type Context, EncryptionError, randomInt32, randomInt64, SetupError } from '@basmilius/apple-common';
import { NTP, Plist } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import LatencyManager from './latencyManager';
import type Protocol from './protocol';

/** Default sample rate for audio streaming (CD quality). */
const SAMPLE_RATE = 44100;

/** Number of audio channels (stereo). */
const CHANNELS = 2;

/** Bytes per sample per channel (16-bit PCM). */
const BYTES_PER_CHANNEL = 2;

/** Number of audio frames per RTP packet. Matches Apple's ALAC/PCM packet size. */
const FRAMES_PER_PACKET = 352;

/** Latency in frames (0.25 seconds at 44100 Hz). Used for silence padding at end of stream. */
const LATENCY_FRAMES = 11025;

/** Maximum number of packets to keep in the retransmission backlog. */
const PACKET_BACKLOG_SIZE = 1000;

/** Interval in milliseconds between RTCP sync packets. */
const SYNC_INTERVAL = 1000;

/** Maximum number of extra packets to send when catching up from being behind schedule. */
const MAX_PACKETS_COMPENSATE = 3;

/** Number of consecutive slow packets before logging a warning. */
const SLOW_WARNING_THRESHOLD = 5;

/** Number of previous frames to include as RFC 2198 redundancy (0 = disabled). */
const REDUNDANCY_COUNT = 0;

/**
 * Audio compression type values for the `ct` field in the SETUP request body.
 *
 * Derived from `APAudioFormatIDToAPCompressionType` in AirPlaySupport framework.
 * Each value selects a different codec for audio transmission.
 */
export const CompressionType = {
    PCM: 1,
    ALAC: 2,
    AAC_LC: 4,
    AAC_ELD: 8,
    Opus: 32
} as const;

/**
 * Audio format bitmask values for the `audioFormat` field in the SETUP request body.
 *
 * Each bit represents a specific sample rate / bit depth / channel count combination.
 * The naming convention is `{codec}_{sampleRate}_{bitDepth}_{channels}`.
 */
export const AudioFormat = {
    PCM_8000_16_1: 0x1,
    PCM_8000_16_2: 0x2,
    PCM_16000_16_1: 0x4,
    PCM_16000_16_2: 0x8,
    PCM_24000_16_1: 0x10,
    PCM_24000_16_2: 0x20,
    PCM_32000_16_1: 0x40,
    PCM_32000_16_2: 0x80,
    PCM_44100_16_1: 0x100,
    PCM_44100_16_2: 0x200,
    PCM_44100_24_1: 0x400,
    PCM_44100_24_2: 0x800,
    PCM_48000_16_1: 0x1000,
    PCM_48000_16_2: 0x2000,
    PCM_48000_24_1: 0x4000,
    PCM_48000_24_2: 0x8000,
    AAC_LC_44100_2: 0x20000,
    AAC_ELD_44100_2: 0x40000,
    AAC_ELD_16000_1: 0x100000,
    AAC_ELD_24000_1: 0x200000,
    ALAC_44100_16_2: 0x400000,
    ALAC_44100_24_2: 0x800000,
    AAC_ELD_32000_1: 0x1000000,
    AAC_ELD_48000_1: 0x2000000,
    AAC_ELD_48000_2: 0x4000000,
    ALAC_48000_16_2: 0x8000000,
    ALAC_48000_24_2: 0x10000000,
    AAC_LC_48000_2: 0x20000000
} as const;

/**
 * Mutable state tracked during an active audio stream.
 *
 * Created by {@link AudioStream.prepare} and updated with each sent packet.
 * Used by both single-device streaming and multi-room multiplexing.
 */
export type AudioStreamContext = {
    /** Negotiated sample rate in Hz. */
    sampleRate: number;
    /** Number of audio channels. */
    channels: number;
    /** Bytes per sample per channel. */
    bytesPerChannel: number;
    /** Total bytes per frame (channels * bytesPerChannel). */
    frameSize: number;
    /** Total bytes per packet (framesPerPacket * frameSize). */
    packetSize: number;
    /** Current RTP sequence number (wraps at 0xFFFF). */
    rtpSeq: number;
    /** Current RTP timestamp (cumulative frame count). */
    rtpTime: number;
    /** Head timestamp for the current packet. */
    headTs: number;
    /** Latency in frames for silence padding at stream end. */
    latency: number;
    /** Number of padding (silence) frames sent so far. */
    paddingSent: number;
    /** Total number of audio frames sent. */
    totalFrames: number;
};

/** Whether to encrypt audio packets with ChaCha20-Poly1305. */
const USE_ENCRYPTION = true;

/**
 * Convert an RTP timestamp to a wall-clock NTP timestamp.
 *
 * Uses a fixed anchor point established when the stream starts: at that moment
 * we record both the RTP timestamp and the wall-clock NTP time. For subsequent
 * packets we compute the elapsed time from the RTP delta and add it to the
 * anchor NTP time. This gives the receiver a real NTP timestamp it can use for
 * multi-room synchronization.
 */
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

export { FRAMES_PER_PACKET, SAMPLE_RATE };

/**
 * Real-time RTP audio streaming over UDP with ChaCha20-Poly1305 encryption.
 *
 * Handles the full audio streaming lifecycle:
 * 1. {@link setup} - RTSP SETUP to negotiate format and get port assignments
 * 2. {@link prepare} - Connect UDP socket, initialize RTP state, FLUSH, start RTCP sync
 * 3. {@link sendFrameData} / {@link stream} - Send PCM frames as encrypted RTP packets
 * 4. {@link finish} / TEARDOWN - Send silence padding and tear down the stream
 *
 * Features:
 * - ChaCha20-Poly1305 audio encryption with per-packet nonces
 * - RTCP sync packets for receiver clock synchronization
 * - Packet retransmission backlog for handling receiver NACK requests
 * - RFC 2198 audio redundancy support (configurable via REDUNDANCY_COUNT)
 * - Wall-clock-based timing to maintain real-time audio pace
 */
export default class AudioStream {
    readonly #protocol: Protocol;
    readonly #context: Context;

    /** Local RTCP control port. */
    #controlPort: number = 0;
    /** UDP socket for RTCP control messages (sync, retransmit requests). */
    #controlSocket?: UdpSocket;
    /** 32-byte shared key for ChaCha20 audio encryption. */
    #sharedKey?: Buffer;
    /** Remote data port assigned by the receiver in SETUP response. */
    #dataPort: number = 0;
    /** Connected UDP socket for sending RTP audio packets. */
    #dataSocket?: UdpSocket;
    /** Negotiated bytes per channel from format negotiation. */
    #negotiatedBytesPerChannel: number = BYTES_PER_CHANNEL;
    /** Negotiated sample rate from format negotiation. */
    #negotiatedSampleRate: number = SAMPLE_RATE;
    /** RTP timestamp at the anchor point for NTP conversion. */
    #anchorRtp: number = 0;
    /** NTP timestamp at the anchor point for RTP-to-NTP conversion. */
    #anchorNtp: bigint = 0n;
    /** Previous frames stored for RFC 2198 redundancy. */
    #previousFrames: Buffer[] = [];
    /** Remote RTCP control port assigned by the receiver in SETUP response. */
    #remoteControlPort: number = 0;
    /** Sent packet backlog for retransmission on NACK, keyed by RTP sequence number. */
    #packetBacklog: Map<number, Buffer> = new Map();
    /** Random Synchronization Source identifier for this RTP stream. */
    #ssrc: number = 0;
    /** Timer for periodic RTCP sync packet transmission. */
    #syncInterval?: NodeJS.Timeout;
    /** Mutable stream state (RTP counters, timing, etc.). */
    #streamContext?: AudioStreamContext;
    /** Dynamic latency manager for adaptive latency control. */
    #latencyManager?: LatencyManager;

    /**
     * @param protocol - The AirPlay protocol instance providing control stream and context.
     */
    constructor(protocol: Protocol) {
        this.#protocol = protocol;
        this.#context = protocol.context;
    }

    /**
     * Performs RTSP SETUP to negotiate audio format and get port assignments.
     *
     * Generates a random shared encryption key and SSRC, creates a local UDP
     * socket for RTCP control, then sends the SETUP request with format
     * preferences (PCM 44100/24/stereo by default). On success, stores the
     * assigned data and control ports and sends RECORD.
     *
     * @returns The assigned data and control port numbers.
     * @throws SetupError if the SETUP request fails or returns no stream info.
     */
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

        // Select the best supported audio format.
        // ct = compression type (1=PCM, 2=ALAC, 4=AAC-LC, 8=AAC-ELD)
        // audioFormat = bitmask for specific variant within that compression type
        const supportedFormats = this.#protocol.receiverInfo?.supportedAudioFormats as number | undefined;
        let ct = CompressionType.PCM;
        let audioFormat: number = AudioFormat.PCM_44100_24_2;
        let sampleRate = SAMPLE_RATE;

        if (supportedFormats) {
            this.#context.logger.info('[audio]', `Receiver supported formats: 0x${supportedFormats.toString(16)}`);
        }

        // TODO(audio-format): bytesPerChannel should be 3 for 24-bit formats, but our audio
        // sources currently produce 16-bit PCM. Using bytesPerChannel=2 with a 24-bit audioFormat
        // works because the receiver compensates, but this is technically incorrect. Revisit when
        // audio sources support 24-bit output.
        let bytesPerChannel = BYTES_PER_CHANNEL;

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
                spf: FRAMES_PER_PACKET,
                sr: sampleRate,
                streamConnectionID,
                supportsDynamicStreamID: false,
                redundantAudio: REDUNDANCY_COUNT > 0,
                supportsRTPPacketRedundancy: REDUNDANCY_COUNT > 0,
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

            this.#negotiatedSampleRate = sampleRate;
            this.#negotiatedBytesPerChannel = bytesPerChannel;
            this.#context.logger.info('[audio]', `Audio stream setup: dataPort=${this.#dataPort}, controlPort=${this.#remoteControlPort}, format=0x${audioFormat.toString(16)}, sr=${sampleRate}, bpc=${bytesPerChannel}`);
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

        const frameSize = CHANNELS * this.#negotiatedBytesPerChannel;
        const packetSize = FRAMES_PER_PACKET * frameSize;

        this.#latencyManager = new LatencyManager(this.#negotiatedSampleRate);
        const latency = this.#latencyManager.getLatency();

        const initialRtpTime = 0;

        // Establish anchor point: link this RTP timestamp to real wall-clock time.
        // The receiver uses this to synchronize playback across multiple speakers.
        this.#anchorRtp = initialRtpTime;
        this.#anchorNtp = NTP.now();

        const ctx: AudioStreamContext = {
            sampleRate: this.#negotiatedSampleRate,
            channels: CHANNELS,
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
     * Sends pre-read frame data as an RTP packet.
     *
     * Used by {@link AudioMultiplexer} for multi-room streaming where frames
     * are read once from the source and sent to multiple streams.
     *
     * @param frames - Raw PCM frame data to send.
     * @param firstPacket - Whether this is the first packet (sets RTP marker bit).
     * @returns Number of frames sent.
     * @throws SetupError if the stream has not been prepared.
     */
    async sendFrameData(frames: Buffer, firstPacket: boolean): Promise<number> {
        if (!this.#streamContext) {
            throw new SetupError('Audio stream not prepared.');
        }

        return this.#sendFrameBuffer(frames, firstPacket, this.#streamContext);
    }

    /**
     * Finishes the audio stream by sending silence padding and tearing down.
     *
     * Sends silence frames equal to the latency amount so the receiver has
     * enough buffered audio for a clean ending, then stops sync and sends
     * RTSP TEARDOWN.
     */
    async finish(): Promise<void> {
        if (!this.#streamContext) {
            return;
        }

        const ctx = this.#streamContext;
        const startFrames = ctx.totalFrames;
        const startTime = performance.now();

        // Send padding (latency worth of silence).
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
        await this.#protocol.controlStream.teardown(`/${this.#protocol.controlStream.sessionId}`);
        this.#context.logger.debug('[audio]', 'TEARDOWN complete');
    }

    /**
     * Streams audio from a source to the receiver.
     *
     * Convenience method that orchestrates the full streaming lifecycle:
     * prepare, send packets with real-time pacing and catch-up logic,
     * pad with silence, TEARDOWN, and close. Automatically compensates
     * when falling behind schedule by sending extra packets.
     *
     * @param source - Audio source to read PCM frames from.
     * @param remoteAddress - IP address of the AirPlay receiver for UDP connection.
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

                const expectedTime = ctx.totalFrames / ctx.sampleRate * 1000;
                const actualTime = performance.now() - startTime;
                const sleepTime = expectedTime - actualTime;

                if (sleepTime > 0) {
                    slowCount = 0;
                    await this.#sleep(sleepTime);
                } else {
                    // We're behind schedule — send extra packets to catch up.
                    const framesBehind = Math.floor((-sleepTime / 1000) * ctx.sampleRate);

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

            this.close();
        } catch (err) {
            this.close();
            throw err;
        }
    }

    /**
     * Reads frames from the audio source and sends them as an RTP packet.
     *
     * When the source is exhausted, sends silence padding until the latency
     * threshold is reached.
     *
     * @param source - Audio source to read frames from.
     * @param firstPacket - Whether this is the first packet (sets RTP marker bit).
     * @param ctx - Mutable stream context with RTP state.
     * @returns Number of frames sent, or 0 when all padding has been sent.
     */
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

    /**
     * Builds and sends an RTP audio packet from raw PCM frame data.
     *
     * Constructs a 12-byte RTP header, optionally prepends RFC 2198 redundancy
     * headers and previous frames, encrypts the audio payload with ChaCha20-Poly1305,
     * stores the packet in the retransmission backlog, and sends via UDP.
     *
     * @param frames - Raw PCM frame data (packetSize bytes).
     * @param firstPacket - Whether this is the first packet (sets RTP marker bit).
     * @param ctx - Mutable stream context with RTP state.
     * @returns Promise resolving to the number of frames sent.
     */
    #sendFrameBuffer(frames: Buffer, firstPacket: boolean, ctx: AudioStreamContext): Promise<number> {
        // Build RTP header (12 bytes)
        const hasRedundancy = REDUNDANCY_COUNT > 0 && this.#previousFrames.length > 0;
        const pt = hasRedundancy ? 0x61 : 0x60; // PT 97 for RFC2198, PT 96 for normal

        const rtpHeader = Buffer.allocUnsafe(12);
        rtpHeader.writeUInt8(0x80, 0);  // Version 2
        rtpHeader.writeUInt8(firstPacket ? (pt | 0x80) : pt, 1);  // Marker + PT
        rtpHeader.writeUInt16BE(ctx.rtpSeq, 2);
        rtpHeader.writeUInt32BE(ctx.headTs >>> 0, 4);
        rtpHeader.writeUInt32BE(this.#ssrc, 8);  // Use random SSRC

        // Build RFC2198 redundancy payload:
        // [redundant headers (4 bytes each)] [primary header (1 byte)] [redundant data...] [primary data]
        let audioPayload: Buffer;

        if (hasRedundancy) {
            const redundantFrames = this.#previousFrames.slice(-REDUNDANCY_COUNT);
            const headers: Buffer[] = [];

            // Redundant block headers (F=1, 4 bytes each)
            for (let i = 0; i < redundantFrames.length; i++) {
                const level = redundantFrames.length - i;
                const tsOffset = level * FRAMES_PER_PACKET;
                const blockLen = redundantFrames[i].length;
                const header = Buffer.allocUnsafe(4);

                // F(1) | PT(7) | timestamp offset(14) | block length(10)
                // F(1) | PT(7) | timestamp offset(14) | block length(10)
                header[0] = 0x80 | 96;                            // F=1, PT=96
                header[1] = ((tsOffset >> 6) & 0xFF);             // timestamp offset high 8 bits
                header[2] = ((tsOffset & 0x3F) << 2) | ((blockLen >> 8) & 0x03); // ts low 6 + len high 2
                header[3] = blockLen & 0xFF;                       // block length low 8 bits

                headers.push(header);
            }

            // Primary block header (F=0, 1 byte)
            headers.push(Buffer.from([96])); // PT = 96

            audioPayload = Buffer.concat([...headers, ...redundantFrames, frames]);
        } else {
            audioPayload = frames;
        }

        // Store current frames for next packet's redundancy
        this.#previousFrames.push(Buffer.from(frames));
        if (this.#previousFrames.length > REDUNDANCY_COUNT) {
            this.#previousFrames.shift();
        }

        // AAD is bytes 4-12 of RTP header (timestamp + SSRC)
        const aad = rtpHeader.subarray(4, 12);

        const payload = USE_ENCRYPTION
            ? this.#encryptAudio(audioPayload, aad, ctx.rtpSeq)
            : audioPayload;

        const packet = Buffer.concat([rtpHeader, payload]);

        // Store for potential retransmission
        this.#storePacket(ctx.rtpSeq, packet);

        // Update context
        const framesSent = Math.floor(frames.length / ctx.frameSize);
        ctx.rtpSeq = (ctx.rtpSeq + 1) & 0xFFFF;
        ctx.headTs = (ctx.headTs + framesSent) >>> 0;
        ctx.totalFrames += framesSent;

        return this.#send(packet).then(() => {
            this.#latencyManager?.reportSuccess();
            return framesSent;
        });
    }

    /**
     * Stores a sent packet in the retransmission backlog.
     *
     * Limits backlog size to {@link PACKET_BACKLOG_SIZE} by removing the oldest entry.
     *
     * @param seqno - RTP sequence number of the packet.
     * @param packet - Complete RTP packet including header.
     */
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

    /**
     * Retrieves a previously sent packet from the retransmission backlog.
     *
     * @param seqno - RTP sequence number to look up.
     * @returns The complete RTP packet, or undefined if no longer in the backlog.
     */
    getPacket(seqno: number): Buffer | undefined {
        return this.#packetBacklog.get(seqno);
    }

    /**
     * Encrypts audio payload data using ChaCha20-Poly1305.
     *
     * Uses the shared key with a 12-byte nonce containing the sequence number
     * at offset 4 (little-endian). The RTP header's timestamp + SSRC fields
     * (bytes 4-12) are used as Additional Authenticated Data (AAD).
     *
     * @param data - Plaintext audio payload to encrypt.
     * @param aad - Additional Authenticated Data (RTP header bytes 4-12).
     * @param seqNumber - RTP sequence number used as the nonce counter.
     * @returns Encrypted payload concatenated with auth tag and 8-byte nonce trailer.
     * @throws EncryptionError if encryption has not been set up.
     */
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

    /**
     * Sends a buffer over the connected UDP data socket.
     *
     * @param data - Data to send.
     */
    #send(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#dataSocket!.send(data, err => err ? reject(err) : resolve());
        });
    }

    /**
     * Sleeps for the given number of milliseconds.
     *
     * @param ms - Duration to sleep in milliseconds.
     */
    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Starts the periodic RTCP sync packet transmission.
     *
     * Sync packets (type 0xD4) tell the receiver our current RTP timestamp
     * and the corresponding NTP wall-clock time, enabling it to synchronize
     * playback. The first packet has the marker bit set.
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

            this.#controlSocket.send(packet, this.#remoteControlPort, this.#protocol.discoveryResult.address, (err) => {
                if (err) {
                    this.#protocol.context.logger.warn('[audio]', 'Sync packet send failed', err);
                }
            });
        };

        sendSync();
        this.#syncInterval = setInterval(sendSync, SYNC_INTERVAL);
    }

    /**
     * Stops the periodic RTCP sync packet transmission and clears stream context.
     */
    #stopSync(): void {
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
            this.#syncInterval = undefined;
        }

        this.#streamContext = undefined;
    }

    /**
     * Handles incoming RTCP control messages from the receiver.
     *
     * Dispatches to the appropriate handler based on the message type byte.
     * Currently handles type 0x55 (retransmit request / NACK).
     *
     * @param data - Raw RTCP packet data.
     * @param rinfo - Remote address info of the sender.
     */
    #onControlMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitPackets(data, rinfo);
        }
    }

    /**
     * Retransmits previously sent packets in response to a receiver NACK.
     *
     * Looks up each requested sequence number in the backlog and sends it
     * wrapped in a retransmit response (type 0xD6). For packets no longer
     * in the backlog, sends a futile retransmit response so the receiver
     * can stop waiting.
     *
     * @param data - NACK packet containing the starting sequence number and count.
     * @param addr - Address to send retransmit responses to.
     */
    #retransmitPackets(data: Buffer, addr: { address: string; port: number }): void {
        const lostSeqno = data.readUInt16BE(4);
        const lostPackets = data.readUInt16BE(6);

        // Each NACK indicates a glitch — report to latency manager.
        this.#latencyManager?.reportGlitch();

        for (let i = 0; i < lostPackets; i++) {
            const seqno = (lostSeqno + i) & 0xFFFF;
            const packet = this.#packetBacklog.get(seqno);

            if (packet) {
                const originalSeqno = packet.subarray(2, 4);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), originalSeqno, packet]);

                this.#controlSocket?.send(resp, addr.port, addr.address);
            } else {
                // Futile retransmit response — packet is no longer in our backlog.
                // Tell the receiver so it can skip waiting for a timeout.
                const seqBuf = Buffer.alloc(2);
                seqBuf.writeUInt16BE(seqno);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), seqBuf, Buffer.alloc(4)]);

                this.#controlSocket?.send(resp, addr.port, addr.address);
            }
        }
    }

    /**
     * Closes the audio stream, releasing all UDP sockets and clearing the backlog.
     *
     * Stops sync packet transmission, closes control and data sockets, and
     * clears the retransmission backlog. Safe to call multiple times.
     */
    close(): void {
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
