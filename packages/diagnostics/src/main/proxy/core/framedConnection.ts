import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { buildNonce, type Context, EncryptionState } from '@corewire/core/transport';
import { ChaCha20 } from '@corewire/core/crypto';

/** One type byte and a 3-byte big-endian payload length. */
const HEADER_SIZE = 4;

/** ChaCha20-Poly1305 auth tag length. */
const AUTH_TAG_LENGTH = 16;

/** Past this many buffered bytes the connection closes. */
const MAX_BUFFER_SIZE = 1024 * 1024;

/** A complete frame, still encrypted, waiting for its turn. */
type QueuedFrame = {
    readonly type: number;
    readonly header: Buffer;
    readonly body: Buffer;
};

/** Frames go to {@link FramedConnection.onFrame}, not through an event. */
type FramedConnectionEvents = {
    close: [];
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
     * @param socket - Already connected.
     * @param plaintextTypes - Never encrypted, also after {@link enableEncryption}.
     */
    constructor(context: Context, socket: Socket, plaintextTypes: number[] = []) {
        super();

        this.#context = context;
        this.#socket = socket;
        this.#plaintextTypes = new Set(plaintextTypes);

        this.#socket.on('data', (data: Buffer) => this.#onData(data));
        this.#socket.on('error', (error: Error) => this.emit('error', error));

        this.#socket.on('close', () => {
            this.#clear();
            this.emit('close');
        });

        this.#socket.on('drain', () => {
            this.#writeBlocked = false;
            this.#flow();
        });
    }

    /**
     * Sets the handler, which gets the decrypted frames one at a time and is awaited before the next one.
     * Frames that arrived before it was set are delivered then, in order.
     */
    onFrame(handler: (type: number, payload: Buffer) => void | Promise<void>): void {
        this.#handler = handler;
        void this.#drain();
    }

    /**
     * @param readKey - 32 bytes, decrypts incoming frames.
     * @param writeKey - 32 bytes, encrypts outgoing frames.
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryption = new EncryptionState(readKey, writeKey);
    }

    close(): void {
        this.#clear();
        this.#socket.destroy();
    }

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
            const nonce = buildNonce(this.#encryption.writeCount++, 'counter-at-0');
            const encrypted = ChaCha20.encrypt(this.#encryption.writeKey, nonce, header, payload);

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

    /** Queues every complete frame, still encrypted, and starts draining. */
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

    /** Decrypts a frame only when its turn comes, so encryption that a previous handler enabled applies. */
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
            this.#context.logger.error('[proxy]', 'Proxy frame handler failed.', error);

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

    /** The header is the AAD; the body is the ciphertext followed by the auth tag. */
    #decrypt(header: Buffer, body: Buffer): Buffer {
        const authTag = body.subarray(body.byteLength - AUTH_TAG_LENGTH);
        const ciphertext = body.subarray(0, body.byteLength - AUTH_TAG_LENGTH);
        const nonce = buildNonce(this.#encryption.readCount++, 'counter-at-0');

        return ChaCha20.decrypt(this.#encryption.readKey, nonce, header, ciphertext, authTag);
    }
}
