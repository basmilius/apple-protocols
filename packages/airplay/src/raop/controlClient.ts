import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { NTP } from '@corewire/core/encoding';
import type { Context } from '@corewire/core/transport';
import { decodeRetransmitRequest, PacketFifo, SyncPacket } from './packets';
import type { StreamContext } from './types';

/**
 * Converts an RTP timestamp to a 64-bit wall-clock NTP timestamp against the
 * anchor taken at stream start, across the 32-bit wrap.
 */
function ntpFromTs(rtpTimestamp: number, sampleRate: number, anchorRtp: number, anchorNtp: bigint): bigint {
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
}

/**
 * UDP control channel of a RAOP stream. It sends periodic sync packets so the
 * receiver aligns its playback clock with our RTP timestamps, and answers
 * retransmit requests from the packet backlog.
 */
export class ControlClient extends EventEmitter {
    readonly #appContext: Context;
    #transport?: UdpSocket;
    #context: StreamContext;
    #packetBacklog: PacketFifo;
    #syncTask?: NodeJS.Timeout;
    #localPort?: number;

    /** RTP timestamp of the NTP anchor. */
    #anchorRtp: number = 0;

    /** NTP wall-clock timestamp of the anchor. */
    #anchorNtp: bigint = 0n;

    #remoteAddress?: string;

    constructor(appContext: Context, context: StreamContext, packetBacklog: PacketFifo) {
        super();

        this.#appContext = appContext;
        this.#context = context;
        this.#packetBacklog = packetBacklog;
    }

    /** Local UDP port of the control channel, or 0 before binding. */
    get port(): number {
        return this.#localPort ?? 0;
    }

    /**
     * Binds the UDP socket and resolves once it listens. Rejects on a bind error.
     *
     * @param port - 0 picks a free port.
     */
    async bind(localIp: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#transport = createSocket('udp4');

            this.#transport.on('error', (err) => {
                this.#appContext.logger.error('[raop-control]', 'Control connection error:', err);
                reject(err);
            });

            this.#transport.on('message', (data, rinfo) => {
                this.#onMessage(data, rinfo);
            });

            this.#transport.on('listening', () => {
                const address = this.#transport!.address();

                this.#localPort = address.port;
                resolve();
            });

            this.#transport.bind(port, localIp);
        });
    }

    /** Stops the sync task and closes the UDP socket. */
    close(): void {
        this.stop();

        if (this.#transport) {
            this.#transport.close();
            this.#transport = undefined;
        }
    }

    /**
     * Sends a sync packet to the receiver now and then every second.
     *
     * @param remoteAddr - IP address of the RAOP receiver.
     * @throws When the sync task is already running.
     */
    start(remoteAddr: string): void {
        this.#remoteAddress = remoteAddr;

        if (this.#syncTask) {
            throw new Error('Already running');
        }

        // Anchors the current headTs to the wall-clock NTP time.
        this.#anchorRtp = this.#context.headTs;
        this.#anchorNtp = NTP.now();

        this.#startSyncTask(remoteAddr, this.#context.controlPort);
    }

    /** Stops the sync task and keeps the UDP socket open. */
    stop(): void {
        if (this.#syncTask) {
            clearInterval(this.#syncTask);
            this.#syncTask = undefined;
        }
    }

    /**
     * Starts the sync loop. The first packet has header byte 0x90 (marker bit
     * set), the rest 0x80.
     *
     * @param port - Remote control port.
     */
    #startSyncTask(addr: string, port: number): void {
        let firstPacket = true;

        const sendSync = () => {
            if (!this.#transport) return;

            const currentTime = ntpFromTs(this.#context.headTs, this.#context.sampleRate, this.#anchorRtp, this.#anchorNtp);
            const [currentSec, currentFrac] = NTP.parts(currentTime);

            const packet = SyncPacket.encode(
                firstPacket ? 0x90 : 0x80,
                0xD4,
                0x0007,
                this.#context.headTs - this.#context.latency,
                currentSec,
                currentFrac,
                this.#context.headTs
            );

            firstPacket = false;
            this.#transport.send(packet, port, addr);
        };

        sendSync();
        this.#syncTask = setInterval(sendSync, 1000);
    }

    /** Answers retransmit requests (type 0x55) and logs the other message types. */
    #onMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        if (data.length < 8 || (data[0] >> 6) !== 2 || rinfo.address !== this.#remoteAddress || rinfo.port !== this.#context.controlPort) {
            return;
        }

        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitLostPackets(decodeRetransmitRequest(data), rinfo);
        } else {
            this.#appContext.logger.debug('[raop-control]', 'Received unhandled control data from', rinfo, data);
        }
    }

    /**
     * Resends each requested packet in a retransmit response (type 0xD6). A
     * packet that left the backlog gets an empty response, so the receiver
     * stops waiting for it.
     */
    #retransmitLostPackets(request: { lostSeqno: number; lostPackets: number }, addr: { address: string; port: number }): void {
        for (let i = 0; i < Math.min(request.lostPackets, 512); i++) {
            const seqno = (request.lostSeqno + i) & 0xFFFF;

            if (this.#packetBacklog.has(seqno)) {
                const packet = this.#packetBacklog.get(seqno)!;

                if (packet.byteLength < 4) {
                    continue;
                }

                const originalSeqno = packet.subarray(2, 4);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), originalSeqno, packet]);

                if (this.#transport) {
                    this.#transport.send(resp, addr.port, addr.address);
                }
            } else {
                const seqBuf = Buffer.alloc(2);

                seqBuf.writeUInt16BE(seqno);

                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), seqBuf, Buffer.alloc(4)]);

                if (this.#transport) {
                    this.#transport.send(resp, addr.port, addr.address);
                }
            }
        }
    }
}
