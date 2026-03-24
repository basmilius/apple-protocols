import { randomInt } from 'node:crypto';
import { ConnectionClosedError, type Context, EncryptionAwareConnection, EncryptionState, TimeoutError } from '@basmilius/apple-common';
import { OPack } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import { FrameType, MessageType, OPackFrameTypes, PairingFrameTypes } from './frame';

/** Size of the frame header in bytes (1 byte type + 3 bytes payload length). */
const HEADER_SIZE = 4;

/** Maximum allowed buffer size (1 MB) before the connection is reset to prevent memory exhaustion. */
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

/** Special queue key for pairing exchanges, which lack the `_x` correlation field. */
const PAIRING_QUEUE_IDENTIFIER = -1;

/** Default timeout in milliseconds for request/response exchanges. */
const DEFAULT_EXCHANGE_TIMEOUT = 10000;

/** A pending exchange entry: resolve callback, reject callback, and timeout handle. */
type QueueEntry = [resolve: Function, reject: Function, timer: NodeJS.Timeout];

/**
 * Companion Link TCP stream with OPack framing and ChaCha20 encryption.
 *
 * Handles the wire protocol for sending and receiving OPack-encoded frames over
 * an encrypted TCP connection to the Apple TV. Provides a request/response exchange
 * pattern using auto-incrementing `_x` correlation IDs, and emits unsolicited events
 * for server-initiated messages.
 *
 * Frame format: `[type:1][payloadLength:3][payload:N][authTag:16?]`
 *
 * Nonce format (Companion Link): 12-byte LE counter at offset 0 (8-byte counter + 4 zero bytes).
 */
export default class Stream extends EncryptionAwareConnection<Record<string, [unknown]>> {
    /** Accessor for the parent class's encryption state (keys and nonce counters). */
    get #encryptionState(): EncryptionState {
        return this._encryption;
    }

    /** Pending request/response exchanges keyed by `_x` or {@link PAIRING_QUEUE_IDENTIFIER}. */
    readonly #queue: Map<number, QueueEntry> = new Map();

    /** Accumulation buffer for incomplete incoming TCP frames. */
    #buffer: Buffer = Buffer.alloc(0);

    /** Auto-incrementing exchange correlation counter. */
    #xid: number;

    /**
     * @param context - The device context providing logger and identity.
     * @param address - The IP address of the Apple TV.
     * @param port - The Companion Link TCP port.
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.debug(true);

        this.#xid = randomInt(0, 2 ** 16);

        this.onStreamClose = this.onStreamClose.bind(this);
        this.onStreamData = this.onStreamData.bind(this);
        this.onStreamError = this.onStreamError.bind(this);

        this.on('close', this.onStreamClose);
        this.on('data', this.onStreamData);
        this.on('error', this.onStreamError);
    }

    /**
     * Disconnects the stream, cleaning up pending exchanges and the read buffer.
     */
    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    /**
     * Sends an OPack message and waits for the correlated response.
     * Pairing frames use a shared queue key since they don't carry an `_x` field.
     *
     * @param type - The frame type to send (see {@link FrameType}).
     * @param obj - The OPack message object to encode and send.
     * @param timeout - Maximum time to wait for a response in milliseconds.
     * @returns A tuple of `[headerByte, decodedPayload]` from the response.
     * @throws TimeoutError if no response arrives within the timeout.
     */
    async exchange(type: number, obj: Record<string, unknown>, timeout: number = DEFAULT_EXCHANGE_TIMEOUT): Promise<[number, unknown]> {
        const _x = this.#xid;
        const isPairing = PairingFrameTypes.includes(type);
        const queueKey = isPairing ? PAIRING_QUEUE_IDENTIFIER : _x;

        return new Promise<[number, unknown]>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#queue.delete(queueKey);
                reject(new TimeoutError(`Exchange timed out for type ${type}`));
            }, timeout);

            this.#queue.set(queueKey, [
                (value: [number, unknown]) => { clearTimeout(timer); resolve(value); },
                (err: Error) => { clearTimeout(timer); reject(err); },
                timer
            ]);

            this.sendOPack(type, obj);
        });
    }

    /**
     * Sends a raw binary frame over the TCP connection.
     * Encrypts the payload with ChaCha20-Poly1305 when encryption is active
     * (except for NoOp frames which are always sent in plaintext).
     *
     * @param type - The frame type byte (see {@link FrameType}).
     * @param payload - The raw payload buffer to send.
     */
    send(type: number, payload: Buffer): void {
        const encrypt = this.isEncrypted && type !== FrameType.NoOp;
        let payloadLength = payload.byteLength;

        if (encrypt) {
            payloadLength += Chacha20.CHACHA20_AUTH_TAG_LENGTH;
        }

        const header = Buffer.allocUnsafe(4);
        header.writeUint8(type, 0);
        header.writeUintBE(payloadLength, 1, 3);

        let data: Buffer;

        if (encrypt) {
            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryptionState.writeCount++), 0);

            const encrypted = Chacha20.encrypt(this.#encryptionState.writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        this.context.logger.raw('[companion-link]', 'Sending data frame', this.isEncrypted, type);

        this.write(data);
    }

    /**
     * Encodes an object as OPack, assigns an `_x` correlation ID, and sends it
     * as a framed message. The `_x` is auto-assigned if not already present.
     *
     * @param type - The frame type byte (see {@link FrameType}).
     * @param obj - The message object to OPack-encode and send.
     */
    sendOPack(type: number, obj: Record<string, unknown>): void {
        const _x = this.#xid++;
        obj._x ??= OPack.sizedInteger(_x, 8);

        this.context.logger.raw('[companion-link]', 'Sending opack frame', type, this.isEncrypted, obj);

        this.send(type, Buffer.from(OPack.encode(obj)));
    }

    /**
     * Clears the read buffer and rejects all pending exchanges with a
     * {@link ConnectionClosedError}.
     */
    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);

        const error = new ConnectionClosedError('Stream cleanup.');

        for (const [, reject, timer] of this.#queue.values()) {
            clearTimeout(timer);
            reject(error);
        }

        this.#queue.clear();
    }

    /**
     * Handles the stream close event by cleaning up pending state.
     */
    onStreamClose(): void {
        this.#cleanup();
    }

    /**
     * Handles incoming TCP data by appending it to the accumulation buffer,
     * then parsing and dispatching complete frames in a loop.
     * Resets the connection if the buffer exceeds {@link MAX_BUFFER_SIZE}.
     *
     * @param data - The raw data chunk received from the TCP socket.
     */
    async onStreamData(data: Buffer): Promise<void> {
        this.#buffer = Buffer.concat([this.#buffer, data]);

        if (this.#buffer.byteLength > MAX_BUFFER_SIZE) {
            this.context.logger.error('[companion-link]', `Buffer exceeded max size (${this.#buffer.byteLength} bytes), resetting connection.`);
            this.#buffer = Buffer.alloc(0);
            this.emit('error', new Error('Buffer overflow: exceeded maximum buffer size'));
            return;
        }

        try {
            while (this.#buffer.byteLength >= HEADER_SIZE) {
                const header = this.#buffer.subarray(0, HEADER_SIZE);
                const payloadLength = header.readUintBE(1, 3);
                const totalLength = HEADER_SIZE + payloadLength;

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

                const payload = frame.subarray(HEADER_SIZE);
                this.#handle(header, payload);
            }
        } catch (err) {
            this.context.logger.error('[companion-link]', 'onStreamData()', err);
            this.emit('error', err);
        }
    }

    /**
     * Handles stream errors by rejecting all pending exchanges with the error.
     *
     * @param err - The error that occurred on the TCP socket.
     */
    onStreamError(err: Error): void {
        for (const [, reject, timer] of this.#queue.values()) {
            clearTimeout(timer);
            reject(err);
        }

        this.#queue.clear();
    }

    /**
     * Decrypts an incoming encrypted frame using ChaCha20-Poly1305.
     * Uses the Companion Link nonce format: 12-byte LE counter at offset 0.
     *
     * @param data - The full encrypted frame (header + ciphertext + auth tag).
     * @returns The decrypted frame (header + plaintext).
     */
    #decrypt(data: Buffer): Buffer {
        const header = data.subarray(0, 4);
        const payloadLength = header.readUintBE(1, 3);

        const payload = data.subarray(4, 4 + payloadLength);
        const authTag = payload.subarray(payload.byteLength - 16);
        const ciphertext = payload.subarray(0, payload.byteLength - 16);

        const nonce = Buffer.alloc(12);
        nonce.writeBigUint64LE(BigInt(this.#encryptionState.readCount++), 0);

        const decrypted = Chacha20.decrypt(this.#encryptionState.readKey, nonce, header, ciphertext, authTag);

        return Buffer.concat([header, decrypted]);
    }

    /**
     * Routes a decoded frame to the appropriate handler: pending exchange response,
     * pairing response, or emitted event.
     *
     * Response matching uses the `_x` correlation ID and only matches frames with
     * `_t: Response` to avoid confusing server-initiated events that happen to share
     * the same `_x` value.
     *
     * @param header - The 4-byte frame header.
     * @param payload - The raw payload buffer (OPack-encoded).
     */
    #handle(header: Buffer, payload: Buffer): void {
        const type = header.readInt8();

        if (!OPackFrameTypes.includes(type)) {
            this.context.logger.warn('[companion-link]', 'Packet not handled, no opack frame.');
            return;
        }

        payload = OPack.decode(payload);

        this.context.logger.raw('[companion-link]', 'Decoded OPACK', {header, payload});

        // Match responses to pending exchanges by _x.
        // Only match if this is actually a Response (_t: 3), not a server Event (_t: 1)
        // that happens to share the same _x value.
        if ('_x' in payload && payload['_t'] === MessageType.Response) {
            const _x = Number(payload['_x']);

            if (this.#queue.has(_x)) {
                const [resolve] = this.#queue.get(_x)!;
                resolve([header, payload]);
                this.#queue.delete(_x);
                return;
            }
        }

        // Pairing responses have no _x.
        if (this.#queue.has(PAIRING_QUEUE_IDENTIFIER)) {
            const [resolve] = this.#queue.get(PAIRING_QUEUE_IDENTIFIER)!;
            resolve([header, payload]);
            this.#queue.delete(PAIRING_QUEUE_IDENTIFIER);
            return;
        }

        // Everything else is an unsolicited message (event).
        if ('_i' in payload) {
            this.emit(payload['_i'] as string, payload['_c']);
        } else {
            this.context.logger.warn('[companion-link]', 'Unhandled message', payload);
        }
    }
}
