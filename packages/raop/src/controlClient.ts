import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import type { Context } from '@basmilius/apple-common';
import { NTP } from '@basmilius/apple-encoding';
import { decodeRetransmitRequest, PacketFifo, SyncPacket } from './packets';
import type { StreamContext } from './types';

/**
 * Converts an RTP timestamp to a 64-bit NTP timestamp by splitting it
 * into seconds and fractional components based on the sample rate.
 *
 * @param timestamp - RTP timestamp in audio frames.
 * @param sampleRate - Audio sample rate in Hz.
 * @returns 64-bit NTP timestamp (upper 32 bits = seconds, lower 32 bits = fraction).
 */
function ntpFromTs(timestamp: number, sampleRate: number): bigint {
    const seconds = Math.floor(timestamp / sampleRate);
    const fraction = ((timestamp % sampleRate) * 0xFFFFFFFF) / sampleRate;

    return (BigInt(seconds) << 32n) | BigInt(Math.floor(fraction));
}

/**
 * UDP control channel client for RAOP streaming. Responsible for two tasks:
 * 1. Sending periodic timing sync packets to the receiver so it can
 *    synchronize its playback clock with our RTP timestamps.
 * 2. Handling retransmit requests from the receiver by resending lost
 *    packets from the packet backlog.
 */
export default class ControlClient extends EventEmitter {
    /** Application context providing logger and device identity. */
    readonly #appContext: Context;
    /** UDP socket for the control channel. */
    #transport?: UdpSocket;
    /** Shared streaming state containing timestamps, ports, and audio format. */
    #context: StreamContext;
    /** FIFO backlog of recently sent packets for retransmission. */
    #packetBacklog: PacketFifo;
    /** Interval timer handle for periodic sync packet sending. */
    #syncTask?: NodeJS.Timeout;
    /** Local UDP port assigned after binding. */
    #localPort?: number;

    /**
     * Creates a new control client.
     *
     * @param appContext - Application context for logging.
     * @param context - Shared stream context with RTP state.
     * @param packetBacklog - Packet FIFO for retransmit lookups.
     */
    constructor(appContext: Context, context: StreamContext, packetBacklog: PacketFifo) {
        super();
        this.#appContext = appContext;
        this.#context = context;
        this.#packetBacklog = packetBacklog;
    }

    /** Local UDP port the control channel is bound to, or 0 if not yet bound. */
    get port(): number {
        return this.#localPort ?? 0;
    }

    /**
     * Binds the control channel UDP socket to a local address and port.
     * Resolves once the socket is listening and the assigned port is known.
     *
     * @param localIp - Local IP address to bind to.
     * @param port - Desired port number (0 for auto-assign).
     * @throws When the UDP socket encounters a bind error.
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

    /**
     * Stops the sync task and closes the UDP socket, releasing all resources.
     */
    close(): void {
        this.stop();

        if (this.#transport) {
            this.#transport.close();
            this.#transport = undefined;
        }
    }

    /**
     * Starts sending periodic sync packets to the receiver. Sync packets
     * are sent immediately and then every second to keep the receiver's
     * playback clock aligned.
     *
     * @param remoteAddr - IP address of the RAOP receiver.
     * @throws When the sync task is already running.
     */
    start(remoteAddr: string): void {
        if (this.#syncTask) {
            throw new Error('Already running');
        }

        this.#startSyncTask(remoteAddr, this.#context.controlPort);
    }

    /**
     * Stops the periodic sync task without closing the UDP socket.
     */
    stop(): void {
        if (this.#syncTask) {
            clearInterval(this.#syncTask);
            this.#syncTask = undefined;
        }
    }

    /**
     * Starts the periodic sync packet sending loop. The first packet uses
     * header byte 0x90 (marker bit set), subsequent packets use 0x80.
     *
     * @param addr - Remote receiver IP address.
     * @param port - Remote control port.
     */
    #startSyncTask(addr: string, port: number): void {
        let firstPacket = true;

        const sendSync = () => {
            if (!this.#transport) return;

            const currentTime = ntpFromTs(this.#context.headTs, this.#context.sampleRate);
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

    /**
     * Handles incoming UDP messages on the control channel. Dispatches
     * retransmit requests (type 0x55) and logs unhandled message types.
     *
     * @param data - Raw UDP packet data.
     * @param rinfo - Remote address info of the sender.
     */
    #onMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitLostPackets(decodeRetransmitRequest(data), rinfo);
        } else {
            this.#appContext.logger.debug('[raop-control]', 'Received unhandled control data from', rinfo, data);
        }
    }

    /**
     * Resends lost packets requested by the receiver. For each requested
     * sequence number, sends the original packet wrapped in a retransmit
     * response (type 0xD6). If the packet is no longer in the backlog,
     * sends an empty futile response to acknowledge the request.
     *
     * @param request - Parsed retransmit request with starting sequence number and count.
     * @param addr - Remote address to send retransmitted packets to.
     */
    #retransmitLostPackets(request: { lostSeqno: number; lostPackets: number }, addr: { address: string; port: number }): void {
        for (let i = 0; i < request.lostPackets; i++) {
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
                // Futile retransmit response — packet is no longer in our backlog.
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
