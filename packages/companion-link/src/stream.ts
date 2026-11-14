import { randomInt } from 'node:crypto';
import { ConnectionClosedError, reporter, TimeoutError } from '@corewire/core';
import { Chacha20 } from '@corewire/core/crypto';
import { OPack } from '@corewire/core/encoding';
import { buildNonce, type Connection, type Context, EncryptionAwareConnection } from '@corewire/core/transport';
import { FrameType, MessageType, OPackFrameTypes, PairingFrameTypes } from './frame';

/** 1 byte frame type and a 3-byte big-endian payload length. */
const HEADER_SIZE = 4;

/** A peer that sends more than this without completing a frame is broken. */
const MAX_BUFFER_SIZE = 1024 * 1024;

/** Pairing replies carry no `_x`, so the one pending pairing exchange waits under this key. */
const PAIRING_QUEUE_IDENTIFIER = -1;

const DEFAULT_EXCHANGE_TIMEOUT = 10000;

const MESSAGE_TYPE_NAMES: Record<number, string> = {
    [MessageType.Event]: 'event',
    [MessageType.Request]: 'request',
    [MessageType.Response]: 'response'
};

/** `event` carries every incoming frame with an `_i` that settled no exchange: its name and its `_c`. */
export type StreamEventMap = {
    readonly event: [name: string, content: unknown];
};

type Pending = {
    readonly resolve: (frame: [number, unknown]) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
};

/**
 * The Companion Link socket: OPack frames of `[type:1][length:3][payload][tag:16?]`, the header
 * being the AAD once encryption is on. The nonce is the 64-bit little-endian message counter at
 * offset 0 of 12 bytes. {@link exchange} waits for the reply with the same `_x`; every other frame
 * with an `_i` becomes an `event`.
 */
export class Stream extends EncryptionAwareConnection<StreamEventMap> {
    readonly #pending: Map<number, Pending> = new Map();
    #buffer: Buffer = Buffer.alloc(0);
    #xid: number = randomInt(0, 2 ** 16);

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        // The generic event map hides the base events from the listener signatures.
        const connection = this as unknown as Connection;
        connection.on('closed', () => this.#onClosed());
        connection.on('data', (data: Buffer) => this.#onData(data));
        connection.on('error', (error: Error) => this.#rejectAll(error));
    }

    /**
     * Sends an OPack frame and resolves with the decoded reply. Pairing frames share one slot,
     * because their replies carry no `_x`.
     *
     * @throws {TimeoutError} When no reply arrives in time.
     * @throws {ConnectionClosedError} When the stream ends first.
     */
    exchange(type: number, message: Record<string, unknown>, timeout: number = DEFAULT_EXCHANGE_TIMEOUT): Promise<[number, unknown]> {
        if (this.signal.aborted) {
            return Promise.reject(new ConnectionClosedError('Stream cleanup.'));
        }

        // Taken before sendOPack advances the counter, so it is the `_x` the frame carries.
        const key = PairingFrameTypes.includes(type) ? PAIRING_QUEUE_IDENTIFIER : this.#xid;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(key);
                reject(new TimeoutError(`Exchange timed out for type ${type}`));
            }, timeout);

            this.#pending.set(key, {
                resolve: frame => {
                    clearTimeout(timer);
                    resolve(frame);
                },
                reject: error => {
                    clearTimeout(timer);
                    reject(error);
                },
                timer
            });

            try {
                this.sendOPack(type, message);
            } catch (err) {
                this.#pending.delete(key);
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    /**
     * Encodes an object as OPack and sends it, with the next `_x` unless it carries one.
     *
     * @throws {ConnectionClosedError} When the stream has ended.
     */
    sendOPack(type: number, message: Record<string, unknown>): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError('Cannot write to a disconnected connection.');
        }

        const xid = this.#xid++;
        message._x ??= OPack.sizedInteger(xid, 8);

        this.context.logger.raw('[companion-link]', 'Sending opack frame', type, this.isEncrypted, message);

        if (reporter.tapsTraffic) {
            this.context.logger.traffic('companionLink', 'out', summarize(type, message), message);
        }

        this.send(type, Buffer.from(OPack.encode(message)));
    }

    /** Writes one frame; encrypted once encryption is on, except NoOp, which stays plaintext. */
    send(type: number, payload: Buffer): void {
        const encryption = type === FrameType.NoOp ? undefined : this._encryption;
        const header = Buffer.allocUnsafe(HEADER_SIZE);

        header.writeUint8(type, 0);
        header.writeUintBE(payload.byteLength + (encryption ? Chacha20.CHACHA20_AUTH_TAG_LENGTH : 0), 1, 3);

        this.context.logger.raw('[companion-link]', 'Sending data frame', this.isEncrypted, type);

        if (!encryption) {
            this.write(Buffer.concat([header, payload]));

            return;
        }

        const nonce = buildNonce(encryption.writeCount++, 'counter-at-0');
        const encrypted = Chacha20.encrypt(encryption.writeKey, nonce, header, payload);

        this.write(Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]));
    }

    #decrypt(frame: Buffer): Buffer {
        const header = frame.subarray(0, HEADER_SIZE);
        const payloadLength = header.readUintBE(1, 3);

        if (payloadLength < Chacha20.CHACHA20_AUTH_TAG_LENGTH) {
            throw new Error(`Encrypted frame payload too short: ${payloadLength} bytes (minimum 16 for auth tag)`);
        }

        const payload = frame.subarray(HEADER_SIZE, HEADER_SIZE + payloadLength);
        const authTag = payload.subarray(payload.byteLength - Chacha20.CHACHA20_AUTH_TAG_LENGTH);
        const ciphertext = payload.subarray(0, payload.byteLength - Chacha20.CHACHA20_AUTH_TAG_LENGTH);
        const nonce = buildNonce(this._encryption.readCount++, 'counter-at-0');

        return Buffer.concat([header, Chacha20.decrypt(this._encryption.readKey, nonce, header, ciphertext, authTag)]);
    }

    /**
     * A reply settles its exchange, a pairing frame the pairing slot, anything else with an `_i`
     * becomes an event.
     */
    #handle(header: Buffer, payload: Buffer): void {
        const type = header.readUint8();

        if (!OPackFrameTypes.includes(type)) {
            this.context.logger.warn('[companion-link]', 'Packet not handled, no opack frame.');

            return;
        }

        const message = OPack.decode(payload) as Record<string, unknown>;

        this.context.logger.raw('[companion-link]', 'Decoded OPACK', {header, payload: message});

        if (reporter.tapsTraffic) {
            this.context.logger.traffic('companionLink', 'in', summarize(type, message), message);
        }

        // The device can reuse the `_x` of an outstanding request in its own events.
        if ('_x' in message && message._t === MessageType.Response && this.#settle(Number(message._x), header, message)) {
            return;
        }

        // Other frames can arrive while pairing waits; only a pairing frame answers it.
        if (PairingFrameTypes.includes(type) && this.#settle(PAIRING_QUEUE_IDENTIFIER, header, message)) {
            return;
        }

        if (!('_i' in message)) {
            this.context.logger.warn('[companion-link]', 'Unhandled message', message);

            return;
        }

        this.emit('event', message._i as string, message._c);
    }

    #onClosed(): void {
        this.#buffer = Buffer.alloc(0);
        this.#rejectAll(new ConnectionClosedError('Stream cleanup.'));
    }

    #onData(data: Buffer): void {
        this.#buffer = Buffer.concat([this.#buffer, data]);

        if (this.#buffer.byteLength > MAX_BUFFER_SIZE) {
            this.context.logger.error('[companion-link]', `Buffer exceeded max size (${this.#buffer.byteLength} bytes), closing the connection.`);
            this.#buffer = Buffer.alloc(0);
            this.destroy(new Error('Buffer overflow: exceeded maximum buffer size'));

            return;
        }

        try {
            while (this.#buffer.byteLength >= HEADER_SIZE) {
                const header = this.#buffer.subarray(0, HEADER_SIZE);
                const totalLength = HEADER_SIZE + header.readUintBE(1, 3);

                if (this.#buffer.byteLength < totalLength) {
                    this.context.logger.warn('[companion-link]', `Data packet is too short needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${data.byteLength}`);

                    return;
                }

                this.context.logger.raw('[companion-link]', `Received frame length=${totalLength} availableLength=${this.#buffer.byteLength} receivedLength=${data.byteLength}`);

                let frame: Buffer = Buffer.from(this.#buffer.subarray(0, totalLength));
                this.#buffer = this.#buffer.subarray(totalLength);

                this.context.logger.raw('[companion-link]', `Handle frame, ${this.#buffer.byteLength} bytes left...`);

                if (this.isEncrypted) {
                    frame = this.#decrypt(frame);
                }

                this.#handle(header, frame.subarray(HEADER_SIZE));
            }
        } catch (err) {
            // A frame that does not decrypt or decode fails the pending exchanges but keeps the stream.
            this.context.logger.error('[companion-link]', 'onStreamData()', err);
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
    }

    #rejectAll(error: Error): void {
        for (const {reject} of this.#pending.values()) {
            reject(error);
        }

        this.#pending.clear();
    }

    #settle(key: number, header: Buffer, message: unknown): boolean {
        const pending = this.#pending.get(key);

        if (!pending) {
            return false;
        }

        this.#pending.delete(key);
        pending.resolve([header.readUint8(), message]);

        return true;
    }
}

function summarize(frameType: number, message: Record<string, unknown>): string {
    const frameName = Object.keys(FrameType).find(name => FrameType[name] === frameType) ?? `frame=${frameType}`;
    const parts = [frameName, MESSAGE_TYPE_NAMES[Number(message._t)], message._i, '_x' in message ? `x=${Number(message._x)}` : undefined];

    return parts.filter(part => part !== undefined).join(' ');
}
