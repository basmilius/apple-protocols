import { ConnectionClosedError, randomInt32, reporter, TimeoutError } from '@corewire/core';
import type { Context } from '@corewire/core/transport';
import { deriveEncryptionKeys } from '@corewire/core/crypto';
import { Plist } from '@corewire/core/encoding';
import { type DescExtension, getExtension, toBinary } from '@bufbuild/protobuf';
import { encodeVarint, messageKind, type MrpMessageMap, type MrpMessageName, parseMessages } from '../mrp/codec';
import { describeProtocolMessage } from '../mrp/describe';
import * as Proto from '../mrp/proto';
import { buildHeader, buildReply, parseHeaderSeqno } from '../utils';
import { EncryptedChannel } from './encrypted';

/** Size of the frame header in bytes. */
const DATA_HEADER_LENGTH = 32;

/** Largest frame we accept; anything bigger is a broken length field. */
const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/** MRP exchange timeout in milliseconds. */
const EXCHANGE_TIMEOUT = 5000;

/** One event per MRP message type, with the decoded extension. `rawMessage` fires first for every message. */
export type DataChannelEventMap = {
    readonly rawMessage: [Proto.ProtocolMessage];
} & { readonly [K in MrpMessageName]: [MrpMessageMap[K]] };

type Outstanding = {
    readonly timer: NodeJS.Timeout;
    resolve(message: Proto.ProtocolMessage): void;
    reject(error: Error): void;
};

/**
 * The MRP channel: protobuf messages over the dedicated data socket. A 32-byte header wraps a
 * plist whose `params.data` holds varint-prefixed ProtocolMessages. {@link exchange} waits for the
 * reply with the same identifier, {@link send} expects none; every incoming message becomes an
 * event. Keys come from the pair-verify secret and the seed of the SETUP that announced the port.
 */
export class DataChannel extends EncryptedChannel<DataChannelEventMap> {
    readonly #outstanding: Map<string, Outstanding> = new Map();
    #seqno: bigint;

    constructor(context: Context, address: string, port: number, sharedSecret: Buffer, seed: bigint) {
        super(context, address, port, deriveEncryptionKeys(sharedSecret, `DataStream-Salt${seed}`, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key'));

        this.#seqno = 0x100000000n + BigInt(randomInt32());

        this.on('closed', () => this.#rejectAll(new ConnectionClosedError()));
        this.on('error', (error: Error) => {
            this.context.logger.error('[data]', 'Data channel error.', error);
            this.#rejectAll(error);
        });
    }

    /**
     * Sends a message and resolves with the reply that carries the same `identifier`, or the
     * first message of the same type when the message has no identifier.
     *
     * @throws {TimeoutError} When no reply arrives in time.
     * @throws {ConnectionClosedError} When the channel ends first.
     */
    exchange(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension], timeout: number = EXCHANGE_TIMEOUT): Promise<Proto.ProtocolMessage> {
        const msg = Array.isArray(message) ? message[0] : message;
        const identifier = msg.identifier || `type_${msg.type}`;

        if (this.signal.aborted) {
            return Promise.reject(new ConnectionClosedError());
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#outstanding.delete(identifier);
                reject(new TimeoutError(`Exchange timed out for ${identifier}`));
            }, timeout);

            this.#outstanding.set(identifier, {resolve, reject, timer});

            try {
                this.send(message);
            } catch (err) {
                this.#outstanding.delete(identifier);
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    /**
     * Sends a message without waiting for a reply.
     *
     * @throws {ConnectionClosedError} When the channel has ended.
     */
    send(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension]): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError();
        }

        if (Array.isArray(message)) {
            message = message[0];
        }

        // Extensions travel as unknown fields; without them the payload is lost.
        const bytes = toBinary(Proto.ProtocolMessageSchema, message, {writeUnknownFields: true});
        const payload = Buffer.concat([Buffer.from(encodeVarint(bytes.byteLength)), bytes]);

        const plistPayload = Buffer.from(Plist.serialize({
            params: {
                data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
            }
        }));

        const header = buildHeader(DATA_HEADER_LENGTH + plistPayload.byteLength, this.#seqno++);

        if (reporter.tapsTraffic || reporter.accepts('raw')) {
            const decoded = describeProtocolMessage(message);
            this.context.logger.raw('[data]', `Sending message. ${decoded.typeName}`, decoded);
            this.#tap('out', decoded, bytes);
        }

        this.writeEncrypted(Buffer.concat([header, plistPayload]));
    }

    /** Frames are a 32-byte header and a plist payload. `sync` frames get a `rply`; `rply` frames only acknowledge transport. */
    protected receive(plaintext: Buffer, received: number): number {
        let offset = 0;

        while (plaintext.byteLength - offset >= DATA_HEADER_LENGTH) {
            const header = plaintext.subarray(offset, offset + DATA_HEADER_LENGTH);
            const totalLength = header.readUint32BE();

            if (totalLength < DATA_HEADER_LENGTH || totalLength > MAX_FRAME_LENGTH) {
                throw new Error(`Invalid DataStream frame length: ${totalLength}`);
            }

            if (plaintext.byteLength - offset < totalLength) {
                this.context.logger.warn('[data]', `Data packet is too short needed=${totalLength} available=${plaintext.byteLength - offset} receivedLength=${received}`);
                break;
            }

            const frame = plaintext.subarray(offset + DATA_HEADER_LENGTH, offset + totalLength);
            const plist = frame.length > 0
                ? Plist.parse(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer) as {params?: {data?: ArrayBuffer}}
                : null;
            const command = header.toString('ascii', 4, 8);

            offset += totalLength;

            if (plist?.params?.data) {
                for (const message of parseMessages(Buffer.from(plist.params.data))) {
                    if (reporter.tapsTraffic || reporter.accepts('raw')) {
                        const decoded = describeProtocolMessage(message);
                        this.context.logger.raw('[data]', `Received message. ${decoded.typeName}`, decoded);
                        this.#tap('in', decoded);
                    }

                    this.#handleMessage(message);
                }
            }

            if (command === 'sync') {
                this.#reply(parseHeaderSeqno(header));
            }
        }

        return offset;
    }

    #reply(seqno: bigint): void {
        this.context.logger.raw('[data]', `Sending reply packet seqno=${seqno}`);
        this.writeEncrypted(buildReply(seqno));
    }

    /** Emits `rawMessage`, settles a matching exchange, then emits the typed event. */
    #handleMessage(message: Proto.ProtocolMessage): void {
        this.emit('rawMessage', message);

        const identifier = message.identifier || `type_${message.type}`;
        const outstanding = this.#outstanding.get(identifier);

        if (outstanding) {
            this.#outstanding.delete(identifier);
            clearTimeout(outstanding.timer);
            outstanding.resolve(message);
        }

        const kind = messageKind(message.type);

        if (!kind) {
            if (message.type !== Proto.ProtocolMessage_Type.UNKNOWN_MESSAGE) {
                this.context.logger.warn('[data]', `Unknown message type ${message.type}.`);
            }

            return;
        }

        const {extension, name: event, level} = kind;
        let decoded: unknown;

        try {
            decoded = getExtension(message, extension);
        } catch (err) {
            this.context.logger.error('[data]', `Failed to parse extension for message type ${message.type}:`, err);

            return;
        }

        this.context.logger[level]('[data]', event, decoded);

        try {
            (this.emit as (event: string, ...args: unknown[]) => boolean)(event, decoded);
        } catch (err) {
            this.context.logger.error('[data]', `A listener for ${event} failed:`, err);
        }
    }

    #rejectAll(error: Error): void {
        for (const {reject, timer} of this.#outstanding.values()) {
            clearTimeout(timer);
            reject(error);
        }

        this.#outstanding.clear();
    }

    #tap(direction: 'in' | 'out', decoded: Record<string, unknown>, bytes?: Uint8Array): void {
        if (!reporter.tapsTraffic) {
            return;
        }

        this.context.logger.traffic('dataStream', direction, String(decoded.typeName), decoded, bytes);
    }
}
