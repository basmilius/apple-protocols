import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { type Context } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';
import { parseRequest, parseResponse, type RtspRequest } from '@basmilius/apple-rtsp';

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

/** Lifecycle events (messages are delivered via {@link ControlConnection.onMessage}). */
type ControlConnectionEvents = {
    close: [];
    error: [error: Error];
};

/**
 * Builds the 12-byte ChaCha20 nonce for the AirPlay control stream: an 8-byte little-endian counter at
 * offset 4 (matching `airplay/src/utils.ts`).
 *
 * @param counter - The per-direction frame counter.
 * @returns The 12-byte nonce.
 */
function nonce(counter: number): Buffer {
    const value = Buffer.alloc(12);
    value.writeBigUInt64LE(BigInt(counter), 4);

    return value;
}

/**
 * AirPlay RTSP over an existing TCP socket, plaintext until {@link enableEncryption}.
 * Encrypted frames use `[2-byte LE length][ciphertext][16-byte tag]`, with the length as AAD and per-direction counters.
 * Delivers parsed messages with their raw bytes for verbatim relaying.
 *
 * Await each handler before parsing the next message: pairing handlers can enable encryption for subsequent bytes.
 */
export class ControlConnection extends EventEmitter<ControlConnectionEvents> {
    /** Whether encryption has been enabled for this connection. */
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
    #encBuffer: Buffer = Buffer.alloc(0);
    #plainBuffer: Buffer = Buffer.alloc(0);
    #draining = false;
    #handler?: (message: ControlMessage) => void | Promise<void>;

    /**
     * @param socket - The already-open TCP socket.
     * @param mode - Whether to parse incoming bytes as requests (server) or responses (client).
     */
    constructor(context: Context, socket: Socket, mode: ControlMode) {
        super();

        this.#context = context;
        this.#socket = socket;
        this.#mode = mode;

        this.#socket.on('data', (data: Buffer) => this.#onData(data));
        this.#socket.on('close', () => this.emit('close'));
        this.#socket.on('error', (error: Error) => this.emit('error', error));
    }

    /**
     * Registers the serial message handler. Messages buffered before this is set are delivered once it is.
     *
     * @param handler - Invoked per parsed message; awaited before the next one is parsed.
     */
    onMessage(handler: (message: ControlMessage) => void | Promise<void>): void {
        this.#handler = handler;
        void this.#drain();
    }

    /**
     * Enables AirPlay control-stream encryption with the given directional keys.
     *
     * @param readKey - The 32-byte key for decrypting incoming frames.
     * @param writeKey - The 32-byte key for encrypting outgoing frames.
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#readKey = readKey;
        this.#writeKey = writeKey;
        this.#encrypted = true;
    }

    /** Destroys the socket. */
    close(): void {
        this.#socket.destroy();
    }

    /**
     * Sends raw RTSP bytes, wrapping them in encrypted frames once encryption is enabled.
     *
     * @param raw - The plaintext RTSP bytes to send.
     */
    send(raw: Buffer): void {
        if (!this.#socket.writable) {
            return;
        }

        if (!this.#encrypted) {
            this.#socket.write(raw);
            return;
        }

        const out: Buffer[] = [];

        for (let offset = 0; offset < raw.length;) {
            const frame = raw.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const length = Buffer.allocUnsafe(2);
            length.writeUInt16LE(frame.length, 0);

            const encrypted = Chacha20.encrypt(this.#writeKey, nonce(this.#writeCount++), length, frame);
            out.push(length, encrypted.ciphertext, encrypted.authTag);
        }

        this.#socket.write(Buffer.concat(out));
    }

    /**
     * Handles incoming socket data: decrypt complete frames into the plaintext buffer, then drain.
     *
     * @param chunk - The raw data chunk from the socket.
     */
    #onData(chunk: Buffer): void {
        try {
            this.#plainBuffer = Buffer.concat([this.#plainBuffer, this.#encrypted ? this.#decryptFrames(chunk) : chunk]);
        } catch (error) {
            this.#context.logger.error('[proxy]', 'AirPlay control decrypt failed', error);
            this.emit('error', error as Error);
            return;
        }

        void this.#drain();
    }

    /**
     * Consumes whole encrypted frames from the internal buffer and returns their concatenated plaintext.
     * Partial trailing frames remain buffered for the next chunk.
     *
     * @param chunk - Newly received encrypted bytes.
     * @returns The plaintext recovered from the complete frames.
     */
    #decryptFrames(chunk: Buffer): Buffer {
        this.#encBuffer = Buffer.concat([this.#encBuffer, chunk]);

        const out: Buffer[] = [];
        let offset = 0;

        while (offset + 2 <= this.#encBuffer.length) {
            const frameLength = this.#encBuffer.readUInt16LE(offset);
            const end = offset + 2 + frameLength + AUTH_TAG_LENGTH;

            if (end > this.#encBuffer.length) {
                break;
            }

            const aad = this.#encBuffer.subarray(offset, offset + 2);
            const ciphertext = this.#encBuffer.subarray(offset + 2, offset + 2 + frameLength);
            const authTag = this.#encBuffer.subarray(offset + 2 + frameLength, end);

            out.push(Chacha20.decrypt(this.#readKey, nonce(this.#readCount++), aad, ciphertext, authTag));
            offset = end;
        }

        this.#encBuffer = this.#encBuffer.subarray(offset);

        return Buffer.concat(out);
    }

    /**
     * Parses complete RTSP messages from the plaintext buffer and delivers them serially.
     */
    async #drain(): Promise<void> {
        if (this.#draining || !this.#handler) {
            return;
        }

        this.#draining = true;

        try {
            while (true) {
                const message = this.#mode === 'server' ? this.#parseRequest() : this.#parseResponse();

                if (!message) {
                    break;
                }

                await this.#handler(message);
            }
        } catch (error) {
            this.#context.logger.error('[proxy]', 'AirPlay control drain failed', error);
            this.emit('error', error as Error);
        } finally {
            this.#draining = false;
        }
    }

    /** Parses one RTSP request from the plaintext buffer, advancing it, or returns null if incomplete. */
    #parseRequest(): ControlMessage | null {
        const request = parseRequest(this.#plainBuffer);

        if (!request) {
            return null;
        }

        const raw = Buffer.from(this.#plainBuffer.subarray(0, request.requestLength));
        this.#plainBuffer = this.#plainBuffer.subarray(request.requestLength);

        return {kind: 'request', raw, request};
    }

    /** Parses one RTSP response from the plaintext buffer, advancing it, or returns null if incomplete. */
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
