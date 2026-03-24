import { fromBinary } from '@bufbuild/protobuf';
import * as Proto from './proto';

/**
 * Builds a 12-byte ChaCha20 nonce for AirPlay stream encryption.
 *
 * The nonce format is: 4 zero bytes + 8-byte little-endian counter at offset 4.
 * This matches the AirPlay DataStream/EventStream nonce format (distinct from
 * the Companion Link format which uses 12-byte LE counter at offset 0).
 *
 * @param counter - Monotonically increasing counter value.
 * @returns 12-byte nonce buffer.
 */
export function nonce(counter: number): Buffer {
    const nonceArray = new Uint8Array(12);
    const view = new DataView(nonceArray.buffer);
    view.setBigUint64(4, BigInt(counter), true);

    return Buffer.from(nonceArray);
}

/**
 * Builds a 32-byte DataStream frame header with the 'sync'/'comm' command format.
 *
 * Layout (32 bytes):
 * - [0..3] total frame size (header + payload) as uint32 BE
 * - [4..7] 'sync' ASCII tag
 * - [8..15] 8 zero bytes (reserved)
 * - [16..19] 'comm' ASCII command tag
 * - [20..27] sequence number as uint64 BE
 * - [28..31] 4 zero bytes (reserved)
 *
 * @param totalSize - Total size of the frame including this header.
 * @param seqno - Sequence number for this frame.
 * @returns 32-byte header buffer.
 */
export function buildHeader(totalSize: number, seqno: bigint): Buffer {
    const buf = Buffer.allocUnsafe(32);

    buf.writeUInt32BE(totalSize, 0);
    buf.write('sync', 4, 'ascii');
    buf.fill(0, 8, 16);
    buf.write('comm', 16, 'ascii');
    buf.writeBigUInt64BE(seqno, 20);
    buf.writeUInt32BE(0, 28);

    return buf;
}

/**
 * Builds a 32-byte DataStream reply header acknowledging a received frame.
 *
 * Reply frames have no payload (size = 32), use the 'rply' tag, and echo
 * back the sequence number of the frame being acknowledged.
 *
 * @param seqno - Sequence number of the frame being acknowledged.
 * @returns 32-byte reply header buffer.
 */
export function buildReply(seqno: bigint): Buffer {
    const header = Buffer.allocUnsafe(32);
    header.writeUInt32BE(32, 0); // size = header only, no payload
    header.write('rply', 4, 'ascii');
    header.fill(0, 8, 16);
    header.fill(0, 16, 20); // command = 4 zero bytes (like pyatv)
    header.writeBigUInt64BE(seqno, 20);
    header.writeUInt32BE(0, 28);

    return header;
}

/**
 * Encodes a non-negative integer as a protobuf-style varint.
 *
 * Each byte uses 7 data bits with the MSB as a continuation flag.
 *
 * @param value - Non-negative integer to encode.
 * @returns Varint-encoded byte array.
 * @throws RangeError if the value is negative.
 */
export function encodeVarint(value: number): Uint8Array {
    if (value < 0) {
        throw new RangeError('Varint only supports non-negative integers');
    }

    const bytes: number[] = [];
    while (value > 127) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }

    bytes.push(value);

    return Uint8Array.from(bytes);
}

/**
 * Extracts the sequence number from a 32-byte DataStream frame header.
 *
 * @param header - At least 28 bytes of the frame header.
 * @returns The sequence number as a bigint.
 * @throws Error if the header is too short.
 */
export function parseHeaderSeqno(header: Buffer): bigint {
    if (header.length < 28) {
        throw new Error('Header too short');
    }

    return header.readBigUInt64BE(20);
}

/**
 * Parses a buffer containing one or more varint-length-prefixed ProtocolMessage
 * protobuf payloads.
 *
 * Handles two wire formats:
 * - Standard: `[varint length][protobuf bytes]` repeated
 * - Legacy: a bare protobuf starting with field tag 0x08 (no length prefix)
 *
 * @param content - Buffer containing serialized protobuf messages.
 * @returns Array of decoded ProtocolMessage instances.
 */
export function parseMessages(content: Buffer): Proto.ProtocolMessage[] {
    const messages: Proto.ProtocolMessage[] = [];
    let offset = 0;

    while (offset < content.length) {
        const firstByte = content[offset];

        if (firstByte === 0x08) {
            const message = content.subarray(offset);
            const decoded = fromBinary(Proto.ProtocolMessageSchema, message, {readUnknownFields: true});
            messages.push(decoded);
            break;
        }

        const [length, variantLen] = readVariant(content, offset);
        offset += variantLen;

        if (offset + length > content.length) {
            break;
        }

        const message = content.subarray(offset, offset + length);
        offset += length;

        const decoded = fromBinary(Proto.ProtocolMessageSchema, message, {readUnknownFields: true});
        messages.push(decoded);
    }

    return messages;
}

/**
 * Reads a varint-encoded integer from a buffer at the given offset.
 *
 * @param buf - Buffer to read from.
 * @param offset - Starting byte offset (defaults to 0).
 * @returns Tuple of [decoded value, number of bytes consumed].
 */
export function readVariant(buf: Buffer, offset = 0): [number, number] {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < buf.length) {
        const byte = buf[offset + bytesRead++];
        result |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            break;
        }

        shift += 7;
    }

    return [result, bytesRead];
}
