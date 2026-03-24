/**
 * Fixed-size FIFO buffer for recently sent RTP audio packets.
 * Used to fulfill retransmission requests from the receiver when
 * packets are lost in transit.
 */
export class PacketFifo {
    /** Maximum number of packets to retain. */
    readonly #maxSize: number;
    /** Map of sequence number to packet data. */
    readonly #packets: Map<number, Buffer> = new Map();
    /** Insertion-ordered list of sequence numbers for eviction. */
    readonly #order: number[] = [];

    /**
     * Creates a new packet FIFO with the given capacity.
     *
     * @param maxSize - Maximum number of packets to store before evicting the oldest.
     */
    constructor(maxSize: number) {
        this.#maxSize = maxSize;
    }

    /**
     * Retrieves a packet by its RTP sequence number.
     *
     * @param seqno - RTP sequence number to look up.
     * @returns The packet buffer, or undefined if not in the backlog.
     */
    get(seqno: number): Buffer | undefined {
        return this.#packets.get(seqno);
    }

    /**
     * Stores a packet in the backlog. If the sequence number already
     * exists, the call is ignored. When the backlog exceeds its maximum
     * size, the oldest packets are evicted.
     *
     * @param seqno - RTP sequence number of the packet.
     * @param packet - Full RTP packet data including header.
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

    /**
     * Checks whether a packet with the given sequence number is in the backlog.
     *
     * @param seqno - RTP sequence number to check.
     * @returns True if the packet exists in the backlog.
     */
    has(seqno: number): boolean {
        return this.#packets.has(seqno);
    }

    /**
     * Removes all packets from the backlog.
     */
    clear(): void {
        this.#packets.clear();
        this.#order.length = 0;
    }
}

/**
 * Encoder for RTP audio packet headers (12 bytes).
 * Produces the standard RTP fixed header used for RAOP audio data packets.
 */
export const AudioPacketHeader = {
    /**
     * Encodes a 12-byte RTP audio packet header.
     *
     * @param header - First byte containing version, padding, and extension flags (typically 0x80).
     * @param payloadType - RTP payload type (0xE0 for first packet, 0x60 for subsequent).
     * @param seqno - 16-bit RTP sequence number.
     * @param timestamp - 32-bit RTP timestamp in audio frames.
     * @param ssrc - Synchronization source identifier (session ID).
     * @returns A 12-byte buffer containing the encoded RTP header.
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
 * Encoder for RAOP timing synchronization packets (20 bytes).
 * Sent periodically over the control channel to synchronize
 * the receiver's playback clock with the sender's RTP timestamps.
 */
export const SyncPacket = {
    /**
     * Encodes a 20-byte sync packet.
     *
     * @param header - First byte (0x90 for first sync, 0x80 for subsequent).
     * @param payloadType - Payload type identifier (0xD4 for sync).
     * @param seqno - 16-bit sequence number (typically 0x0007).
     * @param rtpTimestamp - RTP timestamp of the next audio packet to play, minus latency.
     * @param ntpSec - NTP seconds component of the current wall-clock time.
     * @param ntpFrac - NTP fractional seconds component of the current wall-clock time.
     * @param rtpTimestampNow - RTP timestamp corresponding to the current head position.
     * @returns A 20-byte buffer containing the encoded sync packet.
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

/**
 * Decoded retransmit request received from the RAOP receiver,
 * indicating which packets need to be resent.
 */
export type RetransmitRequest = {
    /** Starting RTP sequence number of the lost range. */
    readonly lostSeqno: number;
    /** Number of consecutive lost packets starting from lostSeqno. */
    readonly lostPackets: number;
}

/**
 * Decodes a retransmit request packet received on the control channel.
 * The request contains the starting sequence number and count of lost packets.
 *
 * @param data - Raw UDP packet data from the receiver.
 * @returns Parsed retransmit request with sequence number and packet count.
 */
export function decodeRetransmitRequest(data: Buffer): RetransmitRequest {
    return {
        lostSeqno: data.readUInt16BE(4),
        lostPackets: data.readUInt16BE(6)
    };
}
