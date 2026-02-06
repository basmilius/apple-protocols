import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { NTP } from '@basmilius/apple-encoding';
import { decodeRetransmitRequest, PacketFifo, SyncPacket } from './packets';
import type { StreamContext } from './types';

export default class ControlClient extends EventEmitter {
    #transport?: UdpSocket;
    #context: StreamContext;
    #packetBacklog: PacketFifo;
    #syncTask?: NodeJS.Timeout;
    #abortController?: AbortController;
    #localPort?: number;

    constructor(context: StreamContext, packetBacklog: PacketFifo) {
        super();
        this.#context = context;
        this.#packetBacklog = packetBacklog;
    }

    get port(): number {
        return this.#localPort ?? 0;
    }

    async bind(localIp: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#transport = createSocket('udp4');

            this.#transport.on('error', (err) => {
                console.error('Control connection error:', err);
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

    close(): void {
        this.stop();

        if (this.#transport) {
            this.#transport.close();
            this.#transport = undefined;
        }
    }

    start(remoteAddr: string): void {
        if (this.#syncTask) {
            throw new Error('Already running');
        }

        this.#abortController = new AbortController();
        this.#startSyncTask(remoteAddr, this.#context.controlPort);
    }

    stop(): void {
        if (this.#abortController) {
            this.#abortController.abort();
            this.#abortController = undefined;
        }

        if (this.#syncTask) {
            clearInterval(this.#syncTask);
            this.#syncTask = undefined;
        }
    }

    #startSyncTask(addr: string, port: number): void {
        let firstPacket = true;

        const sendSync = () => {
            if (!this.#transport) return;

            const currentTime = NTP.fromTs(this.#context.headTs, this.#context.sampleRate);
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

    #onMessage(data: Buffer, rinfo: { address: string; port: number }): void {
        const actualType = data[1] & 0x7F;

        if (actualType === 0x55) {
            this.#retransmitLostPackets(decodeRetransmitRequest(data), rinfo);
        } else {
            console.debug('Received unhandled control data from', rinfo, data);
        }
    }

    #retransmitLostPackets(request: { lostSeqno: number; lostPackets: number }, addr: { address: string; port: number }): void {
        for (let i = 0; i < request.lostPackets; i++) {
            const seqno = request.lostSeqno + i;
            if (this.#packetBacklog.has(seqno)) {
                const packet = this.#packetBacklog.get(seqno)!;
                const originalSeqno = packet.subarray(2, 4);
                const resp = Buffer.concat([Buffer.from([0x80, 0xD6]), originalSeqno, packet]);

                if (this.#transport) {
                    this.#transport.send(resp, addr.port, addr.address);
                }
            } else {
                console.debug(`Packet ${seqno} not in backlog`);
            }
        }
    }
}
