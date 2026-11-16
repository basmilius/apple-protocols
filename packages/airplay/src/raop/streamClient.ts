import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { waitFor } from '@apple-protocols/core';
import type { Context } from '@apple-protocols/core/transport';
import type { AudioSource } from '../audio/source';
import { AUDIO_FRAMES_PER_PACKET } from '../const';
import type { TimingServer } from '../timing';
import { EMPTY_METADATA, MAX_PACKETS_COMPENSATE, PACKET_BACKLOG_SIZE, SLOW_WARNING_THRESHOLD, SUPPORTED_ENCRYPTIONS } from './const';
import { ControlClient } from './controlClient';
import { AudioPacketHeader, PacketFifo } from './packets';
import { RaopRtspClient } from './rtspClient';
import { Statistics } from './statistics';
import { EncryptionType, type MediaMetadata, MetadataType, type RaopPlaybackInfo, type Settings, type StreamContext, type StreamProtocol } from './types';
import { getAudioProperties, getEncryptionTypes, getMetadataTypes } from './utils';

export type EventMap = {
    readonly playing: [playbackInfo: RaopPlaybackInfo];

    /** The stream ended, at the end of the source or through {@link StreamClient.stop}. */
    readonly stopped: [];
};

/**
 * Streams RAOP audio: negotiates encryption and metadata, sets up the control
 * channel, sends PCM packets in real time, publishes metadata and artwork and
 * tears down. When sending falls behind, it bursts extra packets to catch up.
 */
export class StreamClient extends EventEmitter<EventMap> {
    /** The `/info` dictionary fetched during initialization. */
    get info(): Record<string, unknown> {
        return this.#info;
    }

    /** The playback info, with the fallback metadata when the caller gave none. */
    get playbackInfo(): RaopPlaybackInfo {
        return {
            metadata: this.#isMetadataEmpty(this.#metadata) ? this.#missingMetadata : this.#metadata,
            position: this.#streamContext.position
        };
    }

    /** Only an AirPort with MFi-SAP encryption needs auth-setup. */
    get #requiresAuthSetup(): boolean {
        const modelName = this.#properties.get('am') ?? '';

        return (
            (this.#encryptionTypes & EncryptionType.MFiSAP) !== 0
            && modelName.startsWith('AirPort')
        );
    }

    readonly #context: Context;
    readonly #rtsp: RaopRtspClient;
    readonly #streamContext: StreamContext;
    readonly #settings: Settings;
    readonly #protocol: StreamProtocol;
    readonly #packetBacklog: PacketFifo;
    readonly #timingServer: TimingServer;

    /** Shown on the receiver when a stream comes without metadata. */
    readonly #missingMetadata: MediaMetadata;

    #controlClient?: ControlClient;
    #encryptionTypes: EncryptionType = EncryptionType.Unknown;
    #metadataTypes: MetadataType = MetadataType.NotSupported;
    #metadata: MediaMetadata = EMPTY_METADATA;
    #info: Record<string, unknown> = {};

    /** The receiver's mDNS TXT record. */
    #properties: Map<string, string> = new Map();

    /** The streaming loop runs while this is true. */
    #isPlaying: boolean = false;

    /**
     * @param missingMetadata - Shown on the receiver when a stream comes without metadata.
     */
    constructor(context: Context, rtsp: RaopRtspClient, streamContext: StreamContext, protocol: StreamProtocol, settings: Settings, timingServer: TimingServer, missingMetadata: MediaMetadata) {
        super();

        this.#context = context;
        this.#rtsp = rtsp;
        this.#streamContext = streamContext;
        this.#protocol = protocol;
        this.#settings = settings;
        this.#packetBacklog = new PacketFifo(PACKET_BACKLOG_SIZE);
        this.#timingServer = timingServer;
        this.#missingMetadata = missingMetadata;
    }

    /** Closes the control channel and its UDP socket. */
    close(): void {
        this.#controlClient?.close();
        this.#controlClient = undefined;
    }

    /**
     * Reads the receiver's capabilities, binds the control channel, fetches
     * `/info`, sends auth-setup when needed and runs the protocol SETUP.
     *
     * @param properties - The receiver's mDNS TXT record.
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
     * Stops the streaming loop after the current packet. {@link sendAudio}
     * returns once the teardown is done.
     */
    stop(): void {
        this.#context.logger.debug('Stopping audio playback');
        this.#isPlaying = false;
    }

    /**
     * Sets the receiver volume with SET_PARAMETER.
     *
     * @param volume - Volume in dBFS.
     */
    async setVolume(volume: number): Promise<void> {
        await this.#rtsp.setParameter('volume', String(volume));
        this.#streamContext.volume = volume;
    }

    /**
     * Streams PCM after setting up metadata, volume and RTSP RECORD.
     * On completion or error, clears the backlog, tears down RTSP, closes UDP and emits `stopped`.
     *
     * @param volumeDb - Initial volume in dBFS, -144 to 0; the receiver keeps its own when omitted.
     * @param onStreaming - Runs once the setup is done and the audio starts to flow.
     */
    async sendAudio(source: AudioSource, metadata: MediaMetadata = EMPTY_METADATA, volumeDb?: number, onStreaming?: () => void): Promise<void> {
        if (!this.#controlClient) {
            throw new Error('Not initialized');
        }

        this.#streamContext.reset();

        let transport: UdpSocket | undefined;

        try {
            transport = createSocket('udp4');

            await new Promise<void>((resolve, reject) => {
                transport!.once('error', reject);
                transport!.connect(this.#streamContext.serverPort, this.#rtsp.connection.remoteIp, () => {
                    transport!.removeListener('error', reject);
                    resolve();
                });
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

            if (volumeDb !== undefined) {
                await this.setVolume(volumeDb);
            }

            onStreaming?.();

            await this.#streamData(source, transport);
        } catch (err) {
            this.#context.logger.error('An error occurred during streaming.', err);

            throw new Error('An error occurred during streaming.', {cause: err});
        } finally {
            this.#packetBacklog.clear();

            // A failed TEARDOWN must not leave the sockets and timers below running.
            if (transport) {
                await this.#rtsp.teardown(this.#streamContext.rtspSession)
                    .catch(err => this.#context.logger.warn('TEARDOWN failed.', err));

                transport.close();
            }

            this.#protocol.teardown();
            this.close();

            this.emit('stopped');
        }
    }

    /**
     * Sends the source as RTP packets, paced against the clock. When behind,
     * it bursts up to {@link MAX_PACKETS_COMPENSATE} extra packets.
     *
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

            if (framesBehind >= AUDIO_FRAMES_PER_PACKET) {
                const maxPackets = Math.min(
                    Math.floor(framesBehind / AUDIO_FRAMES_PER_PACKET),
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
     * Reads one packet of frames and sends it as an RTP packet, zero-padded to
     * the packet size. Once the source is exhausted, it sends silence until
     * the latency is padded.
     *
     * @param firstPacket - Sends payload type 0xE0 with the marker bit.
     * @param transport - UDP socket connected to the receiver's audio port.
     * @returns Number of frames sent, or 0 when all padding has been sent.
     */
    async #sendPacket(source: AudioSource, firstPacket: boolean, transport: UdpSocket): Promise<number> {
        if (this.#streamContext.paddingSent >= this.#streamContext.latency) {
            return 0;
        }

        let frames = await source.readFrames(AUDIO_FRAMES_PER_PACKET);

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
        this.#streamContext.headTs = (this.#streamContext.headTs + Math.floor(frames.length / this.#streamContext.frameSize)) >>> 0;

        return Math.floor(frames.length / this.#streamContext.frameSize);
    }

    /**
     * Sends a burst of packets to catch up, and stops early when the source
     * is exhausted.
     *
     * @returns The frames sent, and whether more packets are available.
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

    /** True when the caller gave no metadata: all fields empty or zero. */
    #isMetadataEmpty(metadata: MediaMetadata): boolean {
        return metadata.title === ''
            && metadata.artist === ''
            && metadata.album === ''
            && metadata.duration === 0;
    }

    /** Takes the audio format of the stream context from the mDNS TXT record. */
    #updateOutputProperties(properties: Map<string, string>): void {
        const [sampleRate, channels, bytesPerChannel] = getAudioProperties(properties);

        this.#streamContext.sampleRate = sampleRate;
        this.#streamContext.channels = channels;
        this.#streamContext.bytesPerChannel = bytesPerChannel;

        this.#context.logger.debug(`Update play settings to ${sampleRate}/${channels}/${bytesPerChannel * 8}bit`);
    }
}
