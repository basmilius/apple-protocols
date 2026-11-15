/**
 * Fixed-size FIFO of recently sent RTP audio packets, for the receiver's
 * retransmit requests.
 */
export class PacketFifo {
    readonly #maxSize: number;
    readonly #packets: Map<number, Buffer> = new Map();

    /** Sequence numbers in insertion order, for eviction. */
    readonly #order: number[] = [];

    constructor(maxSize: number) {
        this.#maxSize = maxSize;
    }

    get(seqno: number): Buffer | undefined {
        return this.#packets.get(seqno);
    }

    /**
     * Stores a packet unless its sequence number is already present, and
     * evicts the oldest packets past the maximum size.
     *
     * @param packet - Full RTP packet including the header.
     */
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

/** Encoder for the 12-byte RTP fixed header of RAOP audio packets. */
export const AudioPacketHeader = {
    /**
     * @param header - First byte with version, padding and extension flags, usually 0x80.
     * @param payloadType - RTP payload type: 0xE0 for the first packet, 0x60 after that.
     * @param timestamp - 32-bit RTP timestamp in audio frames.
     * @param ssrc - Synchronization source identifier, the session ID.
     */
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

/**
 * Encoder for the 20-byte RAOP sync packet. The control channel sends it
 * periodically to sync the receiver's playback clock with our RTP timestamps.
 */
export const SyncPacket = {
    /**
     * @param header - First byte: 0x90 for the first sync, 0x80 after that.
     * @param payloadType - Payload type, 0xD4 for sync.
     * @param seqno - Sequence number, usually 0x0007.
     * @param rtpTimestamp - RTP timestamp of the next packet to play, minus the latency.
     * @param ntpSec - NTP seconds of the current wall-clock time.
     * @param ntpFrac - NTP fraction of the current wall-clock time.
     * @param rtpTimestampNow - RTP timestamp of the current head position.
     */
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

/** A receiver's request to resend a range of lost packets. */
export type RetransmitRequest = {
    /** First RTP sequence number of the lost range. */
    readonly lostSeqno: number;

    /** Number of consecutive lost packets from `lostSeqno`. */
    readonly lostPackets: number;
}

/**
 * Decodes a retransmit request from the control channel.
 *
 * @throws Error when the packet is not an RTP retransmit request.
 */
export function decodeRetransmitRequest(data: Buffer): RetransmitRequest {
    if (data.length < 8 || (data[0] >> 6) !== 2 || (data[1] & 0x7F) !== 0x55) {
        throw new Error('Invalid RTP retransmit request');
    }

    return {
        lostSeqno: data.readUInt16BE(4),
        lostPackets: data.readUInt16BE(6)
    };
}
