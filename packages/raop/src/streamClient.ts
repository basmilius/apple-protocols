import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { type AudioSource, type Context, type TimingServer, waitFor } from '@basmilius/apple-common';
import { EMPTY_METADATA, FRAMES_PER_PACKET, MAX_PACKETS_COMPENSATE, MISSING_METADATA, PACKET_BACKLOG_SIZE, SLOW_WARNING_THRESHOLD, SUPPORTED_ENCRYPTIONS } from './const';
import { AudioPacketHeader, PacketFifo } from './packets';
import { EncryptionType, type MediaMetadata, MetadataType, type PlaybackInfo, type Settings, type StreamContext, type StreamProtocol } from './types';
import { getAudioProperties, getEncryptionTypes, getMetadataTypes, pctToDbfs } from './utils';
import ControlClient from './controlClient';
import Statistics from './statistics';
import RtspClient from './rtspClient';

/**
 * Event map for the StreamClient, emitted during the audio streaming lifecycle.
 */
export type EventMap = {
    /** Emitted when audio playback starts, providing current playback info. */
    readonly playing: [playbackInfo: PlaybackInfo];
    /** Emitted when audio playback stops (either naturally or via stop()). */
    readonly stopped: [];
};

/**
 * Core streaming engine for RAOP audio. Manages the complete audio streaming
 * lifecycle: initialization (encryption/metadata negotiation, control channel
 * setup), real-time PCM packet sending with timing compensation, metadata
 * and artwork publishing, and teardown.
 *
 * Uses a Statistics tracker to maintain real-time pacing and compensates
 * for slow packet sending by bursting additional packets when falling behind.
 */
export default class StreamClient extends EventEmitter<EventMap> {
    /** Device info dictionary fetched from the receiver during initialization. */
    get info(): Record<string, unknown> {
        return this.#info;
    }

    /**
     * Current playback info snapshot, substituting fallback metadata
     * if the caller provided no metadata.
     */
    get playbackInfo(): PlaybackInfo {
        return {
            metadata: this.#isMetadataEmpty(this.#metadata) ? MISSING_METADATA : this.#metadata,
            position: this.#streamContext.position
        };
    }

    /**
     * Whether MFi-SAP auth-setup is required, determined by the device's
     * supported encryption types and model name (AirPort devices only).
     */
    get #requiresAuthSetup(): boolean {
        const modelName = this.#properties.get('am') ?? '';

        return (
            (this.#encryptionTypes & EncryptionType.MFiSAP) !== 0
            && modelName.startsWith('AirPort')
        );
    }

    /** Application context for logging. */
    readonly #context: Context;
    /** RAOP RTSP client for protocol commands. */
    readonly #rtsp: RtspClient;
    /** Shared mutable streaming state. */
    readonly #streamContext: StreamContext;
    /** Port configuration settings. */
    readonly #settings: Settings;
    /** Protocol abstraction for transport-level operations. */
    readonly #protocol: StreamProtocol;
    /** FIFO backlog of recently sent packets for retransmission. */
    readonly #packetBacklog: PacketFifo;
    /** NTP timing server for clock synchronization with the receiver. */
    readonly #timingServer: TimingServer;

    /** UDP control channel client, created during initialization. */
    #controlClient?: ControlClient;
    /** Bitmask of receiver-supported encryption types. */
    #encryptionTypes: EncryptionType = EncryptionType.Unknown;
    /** Bitmask of receiver-supported metadata types. */
    #metadataTypes: MetadataType = MetadataType.NotSupported;
    /** Current track metadata. */
    #metadata: MediaMetadata = EMPTY_METADATA;
    /** Device info dictionary from the receiver. */
    #info: Record<string, unknown> = {};
    /** mDNS TXT record properties for the device. */
    #properties: Map<string, string> = new Map();
    /** Flag controlling the streaming loop; set to false to stop. */
    #isPlaying: boolean = false;

    /**
     * Creates a new stream client.
     *
     * @param context - Application context for logging.
     * @param rtsp - Connected RAOP RTSP client.
     * @param streamContext - Shared mutable streaming state.
     * @param protocol - Protocol handler for transport operations.
     * @param settings - Port configuration settings.
     * @param timingServer - NTP timing server.
     */
    constructor(context: Context, rtsp: RtspClient, streamContext: StreamContext, protocol: StreamProtocol, settings: Settings, timingServer: TimingServer) {
        super();

        this.#context = context;
        this.#rtsp = rtsp;
        this.#streamContext = streamContext;
        this.#protocol = protocol;
        this.#settings = settings;
        this.#packetBacklog = new PacketFifo(PACKET_BACKLOG_SIZE);
        this.#timingServer = timingServer;
    }

    /**
     * Closes the control channel, releasing its UDP socket.
     */
    close(): void {
        this.#controlClient?.close();
    }

    /**
     * Initializes the streaming session by parsing device capabilities,
     * binding the control channel, fetching device info, performing
     * auth-setup if required, and running the protocol SETUP handshake.
     *
     * @param properties - mDNS TXT record key-value pairs for the device.
     */
    async initialize(properties: Map<string, string>): Promise<void> {
        this.#properties = properties;
        this.#encryptionTypes = getEncryptionTypes(properties);
        this.#metadataTypes = getMetadataTypes(properties);

        this.#context.logger.info(`Initializing RTSP with encryption=${this.#encryptionTypes}, metadata=${this.#metadataTypes}`);

        const intersection = this.#encryptionTypes & SUPPORTED_ENCRYPTIONS;
        if (!intersection || intersection === EncryptionType.Unknown) {
            this.#context.logger.debug('No supported encryption type, continuing anyway');
        }

        this.#updateOutputProperties(properties);

        this.#controlClient = new ControlClient(this.#context, this.#streamContext, this.#packetBacklog);
        await this.#controlClient.bind(
            this.#rtsp.connection.localIp,
            this.#settings.protocols.raop.controlPort
        );

        this.#context.logger.debug(`Local ports: control=${this.#controlClient.port}, timing=${this.#timingServer.port}`);

        const info = await this.#rtsp.info();
        Object.assign(this.#info, info);
        this.#context.logger.debug('Updated info parameters to:', this.#info);

        if (this.#requiresAuthSetup) {
            await this.#rtsp.authSetup();
        }

        await this.#protocol.setup(this.#timingServer.port, this.#controlClient.port);
    }

    /**
     * Signals the streaming loop to stop after the current packet.
     * The `sendAudio()` call will return after teardown completes.
     */
    stop(): void {
        this.#context.logger.debug('Stopping audio playback');
        this.#isPlaying = false;
    }

    /**
     * Changes the playback volume on the receiver via RTSP SET_PARAMETER.
     *
     * @param volume - Volume level in dBFS.
     */
    async setVolume(volume: number): Promise<void> {
        await this.#rtsp.setParameter('volume', String(volume));
        this.#streamContext.volume = volume;
    }

    /**
     * Main entry point for streaming audio. Resets the stream context,
     * connects the UDP audio transport, publishes metadata/artwork/progress,
     * starts the RTSP RECORD session, and enters the real-time streaming loop.
     *
     * On completion or error, performs full teardown: clears the packet backlog,
     * sends RTSP TEARDOWN, closes the UDP transport, and emits 'stopped'.
     *
     * @param source - Audio source providing PCM frames to stream.
     * @param metadata - Track metadata to display on the receiver.
     * @param volume - Optional initial volume as a percentage (0-100), converted to dBFS.
     * @throws When streaming encounters an unrecoverable error.
     */
    async sendAudio(source: AudioSource, metadata: MediaMetadata = EMPTY_METADATA, volume?: number): Promise<void> {
        if (!this.#controlClient) {
            throw new Error('Not initialized');
        }

        this.#streamContext.reset();

        let transport: UdpSocket | undefined;

        try {
            transport = createSocket('udp4');
            await new Promise<void>((resolve) => {
                transport!.connect(this.#streamContext.serverPort, this.#rtsp.connection.remoteIp, resolve);
            });

            this.#controlClient.start(this.#rtsp.connection.remoteIp);

            if ((this.#metadataTypes & MetadataType.Progress) !== 0) {
                const start = this.#streamContext.rtptime;
                const now = this.#streamContext.rtptime;
                const end = start + source.duration * this.#streamContext.sampleRate;
                await this.#rtsp.setParameter('progress', `${start}/${now}/${end}`);
            }

            this.#metadata = metadata;

            if ((this.#metadataTypes & MetadataType.Text) !== 0) {
                this.#context.logger.debug('Playing with metadata:', this.playbackInfo.metadata);
                await this.#rtsp.setMetadata(
                    this.#streamContext.rtspSession,
                    this.#streamContext.rtpseq,
                    this.#streamContext.rtptime,
                    this.playbackInfo.metadata
                );
            }

            if ((this.#metadataTypes & MetadataType.Artwork) !== 0 && metadata.artwork) {
                this.#context.logger.debug(`Sending ${metadata.artwork.length} bytes artwork`);

                await this.#rtsp.setArtwork(
                    this.#streamContext.rtspSession,
                    this.#streamContext.rtpseq,
                    this.#streamContext.rtptime,
                    metadata.artwork
                );
            }

            await this.#protocol.startFeedback();

            this.emit('playing', this.playbackInfo);

            await this.#rtsp.record({
                'Range': 'npt=0-',
                'Session': this.#streamContext.rtspSession,
                'RTP-Info': `seq=${this.#streamContext.rtpseq};rtptime=${this.#streamContext.rtptime}`
            });

            await this.#rtsp.flush({
                headers: {
                    'Range': 'npt=0-',
                    'Session': this.#streamContext.rtspSession,
                    'RTP-Info': `seq=${this.#streamContext.rtpseq};rtptime=${this.#streamContext.rtptime}`
                }
            });

            if (volume !== undefined) {
                await this.setVolume(pctToDbfs(volume));
            }

            await this.#streamData(source, transport);
        } catch (err) {
            this.#context.logger.error('An error occurred during streaming.', err);
            throw new Error('An error occurred during streaming.', {cause: err});
        } finally {
            this.#packetBacklog.clear();

            if (transport) {
                await this.#rtsp.teardown(this.#streamContext.rtspSession);
                transport.close();
            }

            this.#protocol.teardown();
            this.close();

            this.emit('stopped');
        }
    }

    /**
     * Real-time audio streaming loop. Reads PCM frames from the source,
     * sends them as RTP packets over UDP, and uses wall-clock timing to
     * maintain real-time pacing. When falling behind, sends compensating
     * burst packets (up to MAX_PACKETS_COMPENSATE). Logs periodic
     * throughput statistics and slow-sender warnings.
     *
     * @param source - Audio source to read frames from.
     * @param transport - UDP socket connected to the receiver's audio port.
     */
    async #streamData(source: AudioSource, transport: UdpSocket): Promise<void> {
        const stats = new Statistics(this.#streamContext.sampleRate);

        const initialTime = performance.now();
        let prevSlowSeqno: number | null = null;
        let numberSlowSeqno = 0;

        this.#isPlaying = true;

        while (this.#isPlaying) {
            const currentSeqno = this.#streamContext.rtpseq - 1;
            const numSent = await this.#sendPacket(source, stats.totalFrames === 0, transport);

            if (numSent === 0) {
                break;
            }

            stats.tick(numSent);
            const framesBehind = stats.framesBehind;

            if (framesBehind >= FRAMES_PER_PACKET) {
                const maxPackets = Math.min(
                    Math.floor(framesBehind / FRAMES_PER_PACKET),
                    MAX_PACKETS_COMPENSATE
                );

                this.#context.logger.debug(
                    `Compensating with ${maxPackets} packets (${framesBehind} frames behind)`
                );

                const [sentFrames, hasMorePackets] = await this.#sendNumberOfPackets(
                    source,
                    transport,
                    maxPackets
                );
                stats.tick(sentFrames);

                if (!hasMorePackets) {
                    break;
                }
            }

            if (stats.intervalCompleted) {
                const [intervalTime, intervalFrames] = stats.newInterval();
                this.#context.logger.debug(
                    `Sent ${intervalFrames} frames in ${intervalTime.toFixed(3)}s (current frames: ${stats.totalFrames}, expected: ${stats.expectedFrameCount})`
                );
            }

            const absTimeStream = stats.totalFrames / this.#streamContext.sampleRate;
            const relToStart = (performance.now() - initialTime) / 1000;
            const diff = absTimeStream - relToStart;

            if (diff > 0) {
                numberSlowSeqno = 0;
                await waitFor(diff * 1000);
            } else {
                if (prevSlowSeqno === currentSeqno - 1) {
                    numberSlowSeqno++;
                }

                if (numberSlowSeqno >= SLOW_WARNING_THRESHOLD) {
                    this.#context.logger.warn(`Too slow to keep up for seqno ${currentSeqno} (${absTimeStream.toFixed(3)} vs ${relToStart.toFixed(3)} => ${diff.toFixed(3)})`);
                } else {
                    this.#context.logger.debug(`Too slow to keep up for seqno ${currentSeqno} (${absTimeStream.toFixed(3)} vs ${relToStart.toFixed(3)} => ${diff.toFixed(3)})`);
                }

                prevSlowSeqno = currentSeqno;
            }
        }

        const elapsedNs = Number(process.hrtime.bigint() - stats.startTimeNs);
        this.#context.logger.debug(`Audio finished sending in ${(elapsedNs / 1e9).toFixed(3)}s`);
    }

    /**
     * Reads one packet's worth of audio frames from the source and sends
     * it as an RTP packet. If the source is exhausted, sends silence
     * padding until the latency buffer is filled. Undersized frames
     * are zero-padded to the expected packet size.
     *
     * @param source - Audio source to read frames from.
     * @param firstPacket - Whether this is the first packet (uses marker payload type 0xE0).
     * @param transport - UDP socket connected to the receiver's audio port.
     * @returns Number of audio frames sent, or 0 when padding is exhausted.
     */
    async #sendPacket(source: AudioSource, firstPacket: boolean, transport: UdpSocket): Promise<number> {
        if (this.#streamContext.paddingSent >= this.#streamContext.latency) {
            return 0;
        }

        let frames = await source.readFrames(FRAMES_PER_PACKET);

        if (!frames) {
            frames = Buffer.alloc(this.#streamContext.packetSize);
            this.#streamContext.paddingSent += Math.floor(frames.length / this.#streamContext.frameSize);
        } else if (frames.length !== this.#streamContext.packetSize) {
            const padded = Buffer.alloc(this.#streamContext.packetSize);
            frames.copy(padded);
            frames = padded;
        }

        const header = AudioPacketHeader.encode(
            0x80,
            firstPacket ? 0xE0 : 0x60,
            this.#streamContext.rtpseq,
            this.#streamContext.headTs,
            this.#rtsp.sessionId
        );

        const [rtpseq, packet] = await this.#protocol.sendAudioPacket(transport, header, frames);
        this.#packetBacklog.set(rtpseq, packet);

        this.#streamContext.rtpseq = (this.#streamContext.rtpseq + 1) % (2 ** 16);
        this.#streamContext.headTs += Math.floor(frames.length / this.#streamContext.frameSize);

        return Math.floor(frames.length / this.#streamContext.frameSize);
    }

    /**
     * Sends multiple packets in a burst to compensate for falling behind
     * real-time playback. Stops early if the source is exhausted.
     *
     * @param source - Audio source to read frames from.
     * @param transport - UDP socket connected to the receiver's audio port.
     * @param count - Number of packets to send.
     * @returns A tuple of [total frames sent, whether more packets are available].
     */
    async #sendNumberOfPackets(source: AudioSource, transport: UdpSocket, count: number): Promise<[number, boolean]> {
        let totalFrames = 0;

        for (let i = 0; i < count; i++) {
            const sent = await this.#sendPacket(source, false, transport);
            totalFrames += sent;

            if (sent === 0) {
                return [totalFrames, false];
            }
        }

        return [totalFrames, true];
    }

    /**
     * Checks whether the given metadata has all empty/default values,
     * indicating no real metadata was provided by the caller.
     *
     * @param metadata - Metadata to check.
     * @returns True if all fields are empty or zero.
     */
    #isMetadataEmpty(metadata: MediaMetadata): boolean {
        return metadata.title === ''
            && metadata.artist === ''
            && metadata.album === ''
            && metadata.duration === 0;
    }

    /**
     * Updates the stream context audio format from mDNS TXT record
     * properties (sample rate, channels, bytes per channel).
     *
     * @param properties - mDNS TXT record key-value pairs.
     */
    #updateOutputProperties(properties: Map<string, string>): void {
        const [sampleRate, channels, bytesPerChannel] = getAudioProperties(properties);

        this.#streamContext.sampleRate = sampleRate;
        this.#streamContext.channels = channels;
        this.#streamContext.bytesPerChannel = bytesPerChannel;

        this.#context.logger.debug(`Update play settings to ${sampleRate}/${channels}/${bytesPerChannel * 8}bit`);
    }
}
