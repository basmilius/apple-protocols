import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { type Context, EncryptionState } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';

/** Size of the frame header in bytes (1 byte type + 3 bytes payload length, big-endian). */
const HEADER_SIZE = 4;

/** ChaCha20-Poly1305 authentication tag length appended to every encrypted payload. */
const AUTH_TAG_LENGTH = 16;

/** Maximum buffered bytes before the connection is reset to prevent memory exhaustion. */
const MAX_BUFFER_SIZE = 1024 * 1024;

/** A parsed-but-not-yet-decrypted frame awaiting serial processing. */
type QueuedFrame = {
    readonly type: number;
    readonly header: Buffer;
    readonly body: Buffer;
};

/** Lifecycle events emitted by a {@link FramedConnection} (frames are delivered via {@link FramedConnection.onFrame}). */
type FramedConnectionEvents = {
    /** The underlying socket closed. */
    close: [];
    /** A socket or framing error occurred. */
    error: [error: Error];
};

/**
 * A bidirectional, length-prefixed frame transport with optional ChaCha20-Poly1305 encryption, matching
 * the Companion Link wire format `[type:1][payloadLength:3 BE][payload][authTag:16?]`.
 *
 * Unlike {@link Connection} (outbound/client only), this wraps an already-open socket — either accepted by
 * a server (the controller side of a proxy) or connected as a client (the device side). The same
 * {@link EncryptionState} model is reused, with read/write key roles assigned per direction by the caller.
 * Frames whose type is in `plaintextTypes` are never encrypted/decrypted (NoOp and pairing frames).
 *
 * Frames are delivered to the handler **serially**: the next frame is not processed until the current
 * handler (which may be async, e.g. a pairing step that enables encryption) resolves. Decryption is
 * deferred to processing time so a frame received in the same TCP segment as the pairing step that enables
 * encryption is still decrypted with the correct keys. Nonce format: a 12-byte buffer with the
 * per-direction counter as an 8-byte LE integer at offset 0.
 */
export class FramedConnection extends EventEmitter<FramedConnectionEvents> {
    /** Whether encryption has been enabled for this connection. */
    get isEncrypted(): boolean {
        return !!this.#encryption;
    }

    readonly #context: Context;
    readonly #socket: Socket;
    readonly #plaintextTypes: Set<number>;
    readonly #queue: QueuedFrame[] = [];
    #buffer: Buffer = Buffer.alloc(0);
    #draining = false;
    #encryption?: EncryptionState;
    #handler?: (type: number, payload: Buffer) => void | Promise<void>;

    /**
     * @param context - Shared context for logging.
     * @param socket - The already-open TCP socket to frame over.
     * @param plaintextTypes - Frame types that are always sent/received unencrypted.
     */
    constructor(context: Context, socket: Socket, plaintextTypes: number[] = []) {
        super();

        this.#context = context;
        this.#socket = socket;
        this.#plaintextTypes = new Set(plaintextTypes);

        this.#socket.on('data', (data: Buffer) => this.#onData(data));
        this.#socket.on('close', () => this.emit('close'));
        this.#socket.on('error', (error: Error) => this.emit('error', error));
    }

    /**
     * Registers the serial frame handler. Frames received before this is called are buffered and delivered
     * in order once it is set.
     *
     * @param handler - Invoked with each decrypted frame; awaited before the next frame is processed.
     */
    onFrame(handler: (type: number, payload: Buffer) => void | Promise<void>): void {
        this.#handler = handler;
        void this.#drain();
    }

    /**
     * Enables ChaCha20-Poly1305 encryption with the given directional keys. After this, all frames except
     * {@link plaintextTypes} are encrypted on send and decrypted on receive.
     *
     * @param readKey - The 32-byte key for decrypting incoming frames.
     * @param writeKey - The 32-byte key for encrypting outgoing frames.
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryption = new EncryptionState(readKey, writeKey);
    }

    /** Destroys the underlying socket. */
    close(): void {
        this.#socket.destroy();
    }

    /**
     * Frames and sends a payload, encrypting it unless the type is a plaintext type.
     *
     * @param type - The frame type byte.
     * @param payload - The raw payload to send.
     */
    send(type: number, payload: Buffer): void {
        const encrypt = this.isEncrypted && !this.#plaintextTypes.has(type);
        let payloadLength = payload.byteLength;

        if (encrypt) {
            payloadLength += AUTH_TAG_LENGTH;
        }

        const header = Buffer.allocUnsafe(HEADER_SIZE);
        header.writeUint8(type, 0);
        header.writeUintBE(payloadLength, 1, 3);

        let data: Buffer;

        if (encrypt) {
            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryption.writeCount++), 0);

            const encrypted = Chacha20.encrypt(this.#encryption.writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        if (this.#socket.writable) {
            this.#socket.write(data);
        }
    }

    /**
     * Appends incoming data, queues every complete (still-encrypted) frame, and kicks off serial draining.
     *
     * @param chunk - The raw data chunk from the socket.
     */
    #onData(chunk: Buffer): void {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);

        if (this.#buffer.byteLength > MAX_BUFFER_SIZE) {
            this.#buffer = Buffer.alloc(0);
            this.emit('error', new Error('Buffer overflow: exceeded maximum buffer size.'));
            return;
        }

        while (this.#buffer.byteLength >= HEADER_SIZE) {
            const header = this.#buffer.subarray(0, HEADER_SIZE);
            const payloadLength = header.readUintBE(1, 3);
            const totalLength = HEADER_SIZE + payloadLength;

            if (this.#buffer.byteLength < totalLength) {
                break;
            }

            this.#queue.push({
                type: header.readUint8(0),
                header: Buffer.from(header),
                body: Buffer.from(this.#buffer.subarray(HEADER_SIZE, totalLength))
            });

            this.#buffer = this.#buffer.subarray(totalLength);
        }

        void this.#drain();
    }

    /**
     * Processes queued frames one at a time, decrypting at processing time (so encryption enabled by a
     * prior frame's handler applies) and awaiting the handler before moving on.
     */
    async #drain(): Promise<void> {
        if (this.#draining || !this.#handler) {
            return;
        }

        this.#draining = true;

        try {
            while (this.#queue.length > 0) {
                const {type, header, body} = this.#queue.shift();
                let payload = body;

                if (this.isEncrypted && !this.#plaintextTypes.has(type) && body.byteLength >= AUTH_TAG_LENGTH) {
                    payload = this.#decrypt(header, body);
                }

                await this.#handler(type, payload);
            }
        } catch (error) {
            this.#context.logger.error('[proxy]', 'FramedConnection.drain()', error);
            this.emit('error', error as Error);
        } finally {
            this.#draining = false;
        }
    }

    /**
     * Decrypts a frame body using ChaCha20-Poly1305 with the 4-byte header as additional data.
     *
     * @param header - The 4-byte frame header (used as AAD).
     * @param body - The ciphertext followed by the 16-byte auth tag.
     * @returns The decrypted payload.
     */
    #decrypt(header: Buffer, body: Buffer): Buffer {
        const authTag = body.subarray(body.byteLength - AUTH_TAG_LENGTH);
        const ciphertext = body.subarray(0, body.byteLength - AUTH_TAG_LENGTH);

        const nonce = Buffer.alloc(12);
        nonce.writeBigUInt64LE(BigInt(this.#encryption.readCount++), 0);

        return Chacha20.decrypt(this.#encryption.readKey, nonce, header, ciphertext, authTag);
    }
}
