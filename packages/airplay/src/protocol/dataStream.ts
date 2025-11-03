import { debug, encryptChacha20, hkdf, parseBinaryPlist, serializeBinaryPlist } from '@basmilius/apple-common';
import { create, type DescMessage, type MessageInitShape, type MessageShape, toBinary } from '@bufbuild/protobuf';
import { randomInt32 } from './utils';
import AirPlayStream from './stream';

const DATA_HEADER_LENGTH = 32; // 4 + 12 + 4 + 8 + 4

export default class AirPlayDataStream extends AirPlayStream {
    #seqno: bigint;
    #writeCount: number;

    constructor(address: string, port: number) {
        super(address, port);

        this.#seqno = 0x100000000n + BigInt(randomInt32());
        this.#writeCount = 0;
    }

    async sendProto<TMessage extends DescMessage>(
        schema: TMessage,
        init?: MessageInitShape<TMessage>
    ): Promise<void> {
        await this.sendProtoRaw(schema, create(schema, init));
    }

    async sendProtoRaw<TMessage extends DescMessage>(
        schema: TMessage,
        message: MessageShape<TMessage>
    ): Promise<void> {
        const bytes = toBinary(schema, message, {writeUnknownFields: true});
        const lenPrefix = Buffer.from(encodeVarint(bytes.length));
        const pbPayload = Buffer.concat([lenPrefix, Buffer.from(bytes)]);

        const plistPayload = Buffer.from(
            serializeBinaryPlist({
                params: {
                    data: pbPayload.buffer.slice(pbPayload.byteOffset, pbPayload.byteOffset + pbPayload.byteLength)
                }
            } as any)
        );

        const header = buildHeader(DATA_HEADER_LENGTH + plistPayload.byteLength, this.#seqno++);
        const frame = Buffer.concat([header, plistPayload]);
        const encrypted = await this.#encrypt(frame);

        debug(Buffer.from(bytes).toString());

        this.socket.write(encrypted);
    }

    async setup(sharedSecret: Buffer, seed: bigint): Promise<void> {
        const readKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from(`DataStream-Salt${seed}`),
            info: Buffer.from('DataStream-Input-Encryption-Key')
        });

        const writeKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from(`DataStream-Salt${seed}`),
            info: Buffer.from('DataStream-Output-Encryption-Key')
        });

        await this.enableEncryption(readKey, writeKey);
    }

    async onData(buffer: Buffer): Promise<void> {
        const data = await this.decrypt(buffer);
        const frame = data.subarray(DATA_HEADER_LENGTH);
        const plist = parseBinaryPlist(Buffer.from(frame).buffer) as any;

        if (!plist || !plist.params || !plist.params.data) {
            return;
        }

        const protobuf = plist.params.data;
        console.log(Buffer.from(protobuf).toString());
    }

    async #encrypt(data: Buffer): Promise<Buffer> {
        const FRAME_LENGTH = 1024;
        const result: Buffer[] = [];

        for (let offset = 0; offset < data.length;) {
            const frame = data.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const leLength = Buffer.alloc(2);
            leLength.writeUInt16LE(frame.length, 0);

            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#writeCount++), 4);

            const encrypted = encryptChacha20(
                this.writeKey,
                nonce,
                leLength,
                frame
            );

            result.push(leLength, encrypted.ciphertext, encrypted.authTag);
        }

        return Buffer.concat(result);
    }
}

function buildHeader(totalSize: number, seqno: bigint): Buffer {
    const buf = Buffer.alloc(32);

    buf.writeUInt32BE(totalSize, 0);
    buf.write('sync', 4, 'ascii');
    buf.fill(0, 8, 16);
    buf.write('comm', 16, 'ascii');
    buf.writeBigUInt64BE(seqno, 20);
    buf.writeUInt32BE(0, 28);

    return buf;
}

function encodeVarint(value: number): Uint8Array {
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
