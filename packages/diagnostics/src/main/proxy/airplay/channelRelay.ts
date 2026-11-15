import type { Socket } from 'node:net';
import { buildNonce, type Context } from '@corewire/core/transport';
import { ChaCha20 } from '@corewire/core/crypto';

/** Chunk size AirPlay splits an encrypted stream into. */
const FRAME_LENGTH = 1024;

/** ChaCha20-Poly1305 auth tag length. */
const AUTH_TAG_LENGTH = 16;

export type RelayDirection = 'controller->device' | 'device->controller';

/** Receives each decrypted chunk as it is relayed. */
export type RelayLogger = (direction: RelayDirection, plaintext: Buffer) => void;

function nonce(counter: number): Buffer {
    return buildNonce(counter, 'counter-at-4');
}

/**
 * ChaCha20-Poly1305 cipher for both directions of one AirPlay stream. Frames are
 * `[2-byte LE length][ciphertext][16-byte tag]`, the length is the AAD and each direction has its own
 * counter. A partial trailing frame stays buffered until the rest arrives.
 */
export class AirPlayCipher {
    readonly #readKey: Buffer;
    readonly #writeKey: Buffer;
    #readCount = 0;
    #writeCount = 0;
    #buffer: Buffer = Buffer.alloc(0);

    /**
     * @param readKey - The 32-byte key for decrypting incoming frames.
     * @param writeKey - The 32-byte key for encrypting outgoing frames.
     */
    constructor(readKey: Buffer, writeKey: Buffer) {
        this.#readKey = readKey;
        this.#writeKey = writeKey;
    }

    /** Returns the plaintext of every complete frame so far, empty when no frame completed. */
    decrypt(chunk: Buffer): Buffer {
        if (this.#buffer.length + chunk.length > 1024 * 1024) {
            throw new Error('AirPlay relay buffer limit exceeded.');
        }

        this.#buffer = Buffer.concat([this.#buffer, chunk]);

        const plaintexts: Buffer[] = [];
        let offset = 0;

        while (offset + 2 <= this.#buffer.length) {
            const frameLength = this.#buffer.readUInt16LE(offset);

            if (frameLength === 0) {
                throw new Error('Invalid encrypted AirPlay frame length.');
            }

            const end = offset + 2 + frameLength + AUTH_TAG_LENGTH;

            if (end > this.#buffer.length) {
                break;
            }

            const aad = this.#buffer.subarray(offset, offset + 2);
            const ciphertext = this.#buffer.subarray(offset + 2, offset + 2 + frameLength);
            const authTag = this.#buffer.subarray(offset + 2 + frameLength, end);

            plaintexts.push(ChaCha20.decrypt(this.#readKey, nonce(this.#readCount++), aad, ciphertext, authTag));
            offset = end;
        }

        this.#buffer = Buffer.from(this.#buffer.subarray(offset));

        return Buffer.concat(plaintexts);
    }

    encrypt(data: Buffer): Buffer {
        const frames: Buffer[] = [];

        for (let offset = 0; offset < data.length;) {
            const frame = data.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const length = Buffer.allocUnsafe(2);
            length.writeUInt16LE(frame.length, 0);

            const encrypted = ChaCha20.encrypt(this.#writeKey, nonce(this.#writeCount++), length, frame);
            frames.push(length, encrypted.ciphertext, encrypted.authTag);
        }

        return Buffer.concat(frames);
    }
}

/**
 * Relays one AirPlay side channel (event or data stream) between the controller and the device. Each
 * side has its own {@link AirPlayCipher} from its own pairing, so a chunk is decrypted, logged and
 * encrypted again for the other side.
 */
export class ChannelRelay {
    readonly #context: Context;
    readonly #controllerSocket: Socket;
    readonly #controllerCipher: AirPlayCipher;
    readonly #deviceSocket: Socket;
    readonly #deviceCipher: AirPlayCipher;
    readonly #logger: RelayLogger;

    constructor(context: Context, controllerSocket: Socket, controllerCipher: AirPlayCipher, deviceSocket: Socket, deviceCipher: AirPlayCipher, logger: RelayLogger) {
        this.#context = context;
        this.#controllerSocket = controllerSocket;
        this.#controllerCipher = controllerCipher;
        this.#deviceSocket = deviceSocket;
        this.#deviceCipher = deviceCipher;
        this.#logger = logger;
    }

    start(): void {
        this.#controllerSocket.on('data', (data: Buffer) => this.#forward('controller->device', data, this.#controllerCipher, this.#deviceCipher, this.#deviceSocket));
        this.#deviceSocket.on('drain', () => this.#controllerSocket.resume());
        this.#controllerSocket.on('drain', () => this.#deviceSocket.resume());
        this.#deviceSocket.on('data', (data: Buffer) => this.#forward('device->controller', data, this.#deviceCipher, this.#controllerCipher, this.#controllerSocket));

        const teardown = () => {
            this.#controllerSocket.destroy();
            this.#deviceSocket.destroy();
        };

        this.#controllerSocket.on('close', teardown);
        this.#deviceSocket.on('close', teardown);
        this.#controllerSocket.on('error', teardown);
        this.#deviceSocket.on('error', teardown);
    }

    /** Decrypts a chunk with `from`, logs it and writes it to `target` encrypted with `to`. */
    #forward(direction: RelayDirection, data: Buffer, from: AirPlayCipher, to: AirPlayCipher, target: Socket): void {
        try {
            const plaintext = from.decrypt(data);

            if (plaintext.byteLength === 0) {
                return;
            }

            this.#logger(direction, plaintext);

            if (!target.writable) {
                return;
            }

            const encrypted = to.encrypt(plaintext);

            if (target.writableLength + encrypted.length > 1024 * 1024) {
                this.#controllerSocket.destroy();
                this.#deviceSocket.destroy();

                return;
            }

            if (!target.write(encrypted)) {
                (target === this.#deviceSocket ? this.#controllerSocket : this.#deviceSocket).pause();
            }
        } catch (error) {
            this.#context.logger.warn('[proxy]', `AirPlay channel relay failed (${direction}).`, (error as Error).message);
            this.#controllerSocket.destroy();
            this.#deviceSocket.destroy();
        }
    }
}
