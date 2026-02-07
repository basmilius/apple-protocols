import { Plist } from '@basmilius/apple-encoding';
import { fromBinary } from '@bufbuild/protobuf';
import * as Proto from './proto';

export function generateActiveRemoteId(): string {
    return Math.floor(Math.random() * 2 ** 32).toString(10);
}

export function generateDacpId(): string {
    return Math.floor(Math.random() * 2 ** 64).toString(16).toUpperCase();
}

export function generateSessionId(): string {
    return Math.floor(Math.random() * 2 ** 32).toString(10);
}

export function nonce(counter: number): Buffer {
    const nonceArray = new Uint8Array(12);
    const view = new DataView(nonceArray.buffer);
    view.setBigUint64(4, BigInt(counter), true);

    return Buffer.from(nonceArray);
}

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

export function buildReply(seqno: bigint): Buffer {
    const header = Buffer.allocUnsafe(32);
    header.writeUInt32BE(0, 0); // placeholder
    header.write('rply', 4, 'ascii');
    header.fill(0, 8, 16);
    header.writeBigUInt64BE(seqno, 20);
    header.writeUInt32BE(0, 28);

    const plist = Buffer.from(
        Plist.serialize(Buffer.alloc(0) as any)
    );

    const total = header.length + plist.length;
    header.writeUInt32BE(total, 0);

    return Buffer.concat([header, plist]);
}

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

export function parseHeaderSeqno(header: Buffer): bigint {
    if (header.length < 28) {
        throw new Error('Header too short');
    }

    return header.readBigUInt64BE(20);
}

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

export function readVariant(buf: Buffer, offset = 0): [number, number] {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (true) {
        const byte = buf[offset + bytesRead++];
        result |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            break;
        }

        shift += 7;
    }

    return [result, bytesRead];
}
