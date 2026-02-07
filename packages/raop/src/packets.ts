export class PacketFifo {
    readonly #maxSize: number;
    readonly #packets: Map<number, Buffer> = new Map();
    readonly #order: number[] = [];

    constructor(maxSize: number) {
        this.#maxSize = maxSize;
    }

    get(seqno: number): Buffer | undefined {
        return this.#packets.get(seqno);
    }

    set(seqno: number, packet: Buffer): void {
        if (this.#packets.has(seqno)) {
            return;
        }

        this.#packets.set(seqno, packet);
        this.#order.push(seqno);

        while (this.#order.length > this.#maxSize) {
            const oldest = this.#order.shift();
            if (oldest !== undefined) {
                this.#packets.delete(oldest);
            }
        }
    }

    has(seqno: number): boolean {
        return this.#packets.has(seqno);
    }

    clear(): void {
        this.#packets.clear();
        this.#order.length = 0;
    }
}

export const AudioPacketHeader = {
    encode(
        header: number,
        payloadType: number,
        seqno: number,
        timestamp: number,
        ssrc: number
    ): Buffer {
        const packet = Buffer.allocUnsafe(12);
        packet.writeUInt8(header, 0);
        packet.writeUInt8(payloadType, 1);
        packet.writeUInt16BE(seqno, 2);
        packet.writeUInt32BE(timestamp, 4);
        packet.writeUInt32BE(ssrc, 8);
        return packet;
    }
};

export const SyncPacket = {
    encode(
        header: number,
        payloadType: number,
        seqno: number,
        rtpTimestamp: number,
        ntpSec: number,
        ntpFrac: number,
        rtpTimestampNow: number
    ): Buffer {
        const packet = Buffer.allocUnsafe(20);
        packet.writeUInt8(header, 0);
        packet.writeUInt8(payloadType, 1);
        packet.writeUInt16BE(seqno, 2);
        packet.writeUInt32BE(rtpTimestamp, 4);
        packet.writeUInt32BE(ntpSec, 8);
        packet.writeUInt32BE(ntpFrac, 12);
        packet.writeUInt32BE(rtpTimestampNow, 16);
        return packet;
    }
};

export type RetransmitRequest = {
    readonly lostSeqno: number;
    readonly lostPackets: number;
}

export function decodeRetransmitRequest(data: Buffer): RetransmitRequest {
    return {
        lostSeqno: data.readUInt16BE(4),
        lostPackets: data.readUInt16BE(6)
    };
}
