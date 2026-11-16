import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { buildNonce, type Context } from '@apple-protocols/core/transport';
import { ChaCha20 } from '@apple-protocols/core/crypto';
import { parseRequest, parseResponse, type RtspRequest } from '@apple-protocols/airplay/rtsp';

/** Chunk size AirPlay splits the control stream into when encrypting. */
const FRAME_LENGTH = 1024;

/** ChaCha20-Poly1305 auth tag length. */
const AUTH_TAG_LENGTH = 16;

/** Whether this side parses incoming bytes as RTSP requests (server) or responses (client). */
export type ControlMode = 'server' | 'client';

/** A parsed control-stream message together with the exact plaintext bytes it occupied. */
export type ControlMessage =
    | {readonly kind: 'request'; readonly raw: Buffer; readonly request: RtspRequest}
    | {readonly kind: 'response'; readonly raw: Buffer; readonly status: number; readonly statusText: string; readonly headers: Headers; readonly body: Buffer};

/** Messages go to {@link ControlConnection.onMessage}, not through an event. */
type ControlConnectionEvents = {
    close: [];
    error: [error: Error];
};

function nonce(counter: number): Buffer {
    return buildNonce(counter, 'counter-at-4');
}

/**
 * AirPlay RTSP over an existing TCP socket, plaintext until {@link enableEncryption}.
 * Encrypted frames use `[2-byte LE length][ciphertext][16-byte tag]`, with the length as AAD and per-direction counters.
 * Delivers parsed messages with their raw bytes for verbatim relaying.
 *
 * Await each handler before parsing the next message: pairing handlers can enable encryption for subsequent bytes.
 */
export class ControlConnection extends EventEmitter<ControlConnectionEvents> {
    get isEncrypted(): boolean {
        return this.#encrypted;
    }

    readonly #context: Context;
    readonly #socket: Socket;
    readonly #mode: ControlMode;
    #encrypted = false;
    #readKey?: Buffer;
    #writeKey?: Buffer;
    #readCount = 0;
    #writeCount = 0;
    #encryptedBuffer: Buffer = Buffer.alloc(0);
    #plainBuffer: Buffer = Buffer.alloc(0);
    #draining = false;
    #closed = false;
    #writeBlocked = false;
    #activeBytes = 0;
    #handler?: (message: ControlMessage) => void | Promise<void>;

    /** @param socket - Already connected. */
    constructor(context: Context, socket: Socket, mode: ControlMode) {
        super();

        this.#context = context;
        this.#socket = socket;
        this.#mode = mode;

        this.#socket.on('data', (data: Buffer) => this.#onData(data));
        this.#socket.on('error', (error: Error) => this.emit('error', error));

        this.#socket.on('close', () => {
            this.#closed = true;
            this.#encryptedBuffer = this.#plainBuffer = Buffer.alloc(0);
            this.emit('close');
        });

        this.#socket.on('drain', () => {
            this.#writeBlocked = false;
            this.#flow();
        });
    }

    /**
     * Sets the handler, which gets the messages one at a time and is awaited before the next one. Messages
     * that arrived before it was set are delivered then.
     */
    onMessage(handler: (message: ControlMessage) => void | Promise<void>): void {
        this.#handler = handler;
        void this.#drain();
    }

    /**
     * @param readKey - 32 bytes, decrypts incoming frames.
     * @param writeKey - 32 bytes, encrypts outgoing frames.
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#readKey = readKey;
        this.#writeKey = writeKey;
        this.#encrypted = true;
    }

    close(): void {
        this.#closed = true;
        this.#encryptedBuffer = this.#plainBuffer = Buffer.alloc(0);
        this.#socket.destroy();
    }

    /** Sends plaintext RTSP bytes, in encrypted frames once encryption is on. */
    send(raw: Buffer): void {
        if (!this.#socket.writable) {
            return;
        }

        if (!this.#encrypted) {
            this.#write(raw);

            return;
        }

        const frames: Buffer[] = [];

        for (let offset = 0; offset < raw.length;) {
            const frame = raw.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const length = Buffer.allocUnsafe(2);
            length.writeUInt16LE(frame.length, 0);

            const encrypted = ChaCha20.encrypt(this.#writeKey, nonce(this.#writeCount++), length, frame);
            frames.push(length, encrypted.ciphertext, encrypted.authTag);
        }

        this.#write(Buffer.concat(frames));
    }

    #onData(chunk: Buffer): void {
        try {
            if (this.#closed) {
                return;
            }

            if (this.#plainBuffer.length + this.#encryptedBuffer.length + this.#activeBytes + chunk.length > 1024 * 1024) {
                throw new Error('Control receive buffer limit exceeded.');
            }

            this.#plainBuffer = Buffer.concat([this.#plainBuffer, this.#encrypted ? this.#decryptFrames(chunk) : chunk]);
        } catch (error) {
            this.#context.logger.error('[proxy]', 'Could not decrypt the AirPlay control stream.', error);
            this.close();
            this.emit('error', error as Error);

            return;
        }

        this.#flow();
        void this.#drain();
    }

    /** Returns the plaintext of every complete frame; a partial trailing frame waits for the next chunk. */
    #decryptFrames(chunk: Buffer): Buffer {
        this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, chunk]);

        const plaintexts: Buffer[] = [];
        let offset = 0;

        while (offset + 2 <= this.#encryptedBuffer.length) {
            const frameLength = this.#encryptedBuffer.readUInt16LE(offset);

            if (frameLength === 0) {
                throw new Error('Invalid control frame length.');
            }

            const end = offset + 2 + frameLength + AUTH_TAG_LENGTH;

            if (end > this.#encryptedBuffer.length) {
                break;
            }

            const aad = this.#encryptedBuffer.subarray(offset, offset + 2);
            const ciphertext = this.#encryptedBuffer.subarray(offset + 2, offset + 2 + frameLength);
            const authTag = this.#encryptedBuffer.subarray(offset + 2 + frameLength, end);

            plaintexts.push(ChaCha20.decrypt(this.#readKey, nonce(this.#readCount++), aad, ciphertext, authTag));
            offset = end;
        }

        this.#encryptedBuffer = Buffer.from(this.#encryptedBuffer.subarray(offset));

        return Buffer.concat(plaintexts);
    }

    async #drain(): Promise<void> {
        if (this.#closed || this.#draining || !this.#handler) {
            return;
        }

        this.#draining = true;

        try {
            while (!this.#closed) {
                const message = this.#mode === 'server' ? this.#parseRequest() : this.#parseResponse();

                if (!message) {
                    break;
                }

                this.#activeBytes = message.raw.length;
                this.#flow();

                await this.#handler(message);

                this.#activeBytes = 0;
                this.#flow();
            }
        } catch (error) {
            this.#context.logger.error('[proxy]', 'AirPlay control message handler failed.', error);
            this.close();
            this.emit('error', error as Error);
        } finally {
            this.#draining = false;
        }
    }

    #write(data: Buffer): void {
        if (this.#closed) {
            return;
        }

        if (this.#socket.writableLength + data.length > 1024 * 1024) {
            this.close();
            this.emit('error', new Error('Control write buffer limit exceeded.'));

            return;
        }

        if (!this.#socket.write(data)) {
            this.#writeBlocked = true;
            this.#flow();
        }
    }

    #flow(): void {
        if (this.#closed) {
            return;
        }

        if (this.#writeBlocked || this.#plainBuffer.length + this.#encryptedBuffer.length + this.#activeBytes >= 512 * 1024) {
            this.#socket.pause();
        } else {
            this.#socket.resume();
        }
    }

    /** Takes one RTSP request off the plaintext buffer, or returns null while it is incomplete. */
    #parseRequest(): ControlMessage | null {
        const request = parseRequest(this.#plainBuffer);

        if (!request) {
            return null;
        }

        const raw = Buffer.from(this.#plainBuffer.subarray(0, request.requestLength));
        this.#plainBuffer = this.#plainBuffer.subarray(request.requestLength);

        return {kind: 'request', raw, request};
    }

    /** Takes one RTSP response off the plaintext buffer, or returns null while it is incomplete. */
    #parseResponse(): ControlMessage | null {
        const parsed = parseResponse(this.#plainBuffer);

        if (!parsed) {
            return null;
        }

        const raw = Buffer.from(this.#plainBuffer.subarray(0, parsed.responseLength));
        this.#plainBuffer = this.#plainBuffer.subarray(parsed.responseLength);

        return {
            kind: 'response',
            raw,
            status: parsed.response.status,
            statusText: parsed.response.statusText,
            headers: parsed.response.headers,
            body: Buffer.from(raw.subarray(raw.byteLength - Number(parsed.response.headers.get('content-length') ?? 0)))
        };
    }
}
