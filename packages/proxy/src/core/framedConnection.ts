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
 * Companion Link framing over an existing socket: `[type:1][payloadLength:3 BE][payload][authTag:16?]`.
 * The caller assigns read/write key roles. `plaintextTypes` bypass encryption for NoOp and pairing frames.
 * Nonces use an 8-byte LE per-direction counter at offset 0 in a 12-byte buffer.
 *
 * Await each handler before decrypting the next frame: a pairing handler may enable encryption for a frame in the same TCP segment.
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
    #closed = false;
    #queuedBytes = 0;
    #writeBlocked = false;
    #encryption?: EncryptionState;
    #handler?: (type: number, payload: Buffer) => void | Promise<void>;

    /**
     * @param socket - The already-open TCP socket to frame over.
     * @param plaintextTypes - Frame types that are always sent/received unencrypted.
     */
    constructor(context: Context, socket: Socket, plaintextTypes: number[] = []) {
        super();

        this.#context = context;
        this.#socket = socket;
        this.#plaintextTypes = new Set(plaintextTypes);

        this.#socket.on('data', (data: Buffer) => this.#onData(data));
        this.#socket.on('close', () => {this.#clear(); this.emit('close');});
        this.#socket.on('drain', () => {this.#writeBlocked = false; this.#flow();});
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
        this.#clear();
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

        if (!this.#closed && this.#socket.writable) {
            if (this.#socket.writableLength + data.length > MAX_BUFFER_SIZE) {
                this.#fail(new Error('Proxy write buffer limit exceeded.'));
                return;
            }
            if (!this.#socket.write(data)) {
                this.#writeBlocked = true;
                this.#flow();
            }
        }
    }

    /**
     * Appends incoming data, queues every complete (still-encrypted) frame, and kicks off serial draining.
     *
     * @param chunk - The raw data chunk from the socket.
     */
    #onData(chunk: Buffer): void {
        if (this.#closed) {
            return;
        }
        if (this.#buffer.length + this.#queuedBytes + chunk.length > MAX_BUFFER_SIZE) {
            this.#fail(new Error('Proxy receive queue limit exceeded.'));
            return;
        }
        this.#buffer = Buffer.concat([this.#buffer, chunk]);

        while (this.#buffer.byteLength >= HEADER_SIZE) {
            const header = this.#buffer.subarray(0, HEADER_SIZE);
            const payloadLength = header.readUintBE(1, 3);
            const totalLength = HEADER_SIZE + payloadLength;

            if (this.#buffer.byteLength < totalLength) {
                break;
            }

            this.#queuedBytes += totalLength;
            this.#queue.push({
                type: header.readUint8(0),
                header: Buffer.from(header),
                body: Buffer.from(this.#buffer.subarray(HEADER_SIZE, totalLength))
            });

            this.#buffer = Buffer.from(this.#buffer.subarray(totalLength));
        }

        this.#flow();
        void this.#drain();
    }

    /**
     * Processes queued frames one at a time, decrypting at processing time (so encryption enabled by a
     * prior frame's handler applies) and awaiting the handler before moving on.
     */
    async #drain(): Promise<void> {
        if (this.#closed || this.#draining || !this.#handler) {
            return;
        }

        this.#draining = true;

        try {
            while (!this.#closed && this.#queue.length > 0) {
                const {type, header, body} = this.#queue.shift();
                let payload = body;

                if (this.isEncrypted && !this.#plaintextTypes.has(type)) {
                    if (body.byteLength < AUTH_TAG_LENGTH) {
                        throw new Error('Encrypted proxy frame has no authentication tag.');
                    }
                    payload = this.#decrypt(header, body);
                }

                await this.#handler(type, payload);
                if (!this.#closed) {
                    this.#queuedBytes -= HEADER_SIZE + body.length;
                    this.#flow();
                }
            }
        } catch (error) {
            this.#context.logger.error('[proxy]', 'FramedConnection.drain()', error);
            if (!this.#closed) {
                this.#fail(error as Error);
            }
        } finally {
            this.#draining = false;
        }
    }

    get stats(): {queuedBytes: number; writeBytes: number; paused: boolean} {
        return {queuedBytes: this.#queuedBytes + this.#buffer.length, writeBytes: this.#socket.writableLength, paused: this.#socket.isPaused()};
    }

    #flow(): void {
        if (this.#closed) {
            return;
        }
        if (this.#writeBlocked || this.#queuedBytes + this.#buffer.length >= MAX_BUFFER_SIZE / 2) {
            this.#socket.pause();
        } else {
            this.#socket.resume();
        }
    }

    #clear(): void {
        this.#closed = true;
        this.#buffer = Buffer.alloc(0);
        this.#queue.length = 0;
        this.#queuedBytes = 0;
    }

    #fail(error: Error): void {
        this.close();
        this.emit('error', error);
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
