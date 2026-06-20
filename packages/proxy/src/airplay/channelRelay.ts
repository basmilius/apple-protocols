import type { Socket } from 'node:net';
import { type Context } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';

/** Chunk size AirPlay splits an encrypted stream into. */
const FRAME_LENGTH = 1024;

/** ChaCha20-Poly1305 auth tag length. */
const AUTH_TAG_LENGTH = 16;

/** The direction a relayed chunk travelled. */
export type RelayDirection = 'controller->device' | 'device->controller';

/** Callback invoked with each decrypted chunk as it is relayed, for logging. */
export type RelayLogger = (direction: RelayDirection, plaintext: Buffer) => void;

/**
 * Builds the 12-byte ChaCha20 nonce for an AirPlay stream: an 8-byte little-endian counter at offset 4
 * (matching `airplay/src/utils.ts`).
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
 * Stateful ChaCha20-Poly1305 cipher for one AirPlay stream direction-pair. The wire format is a sequence
 * of frames `[2-byte LE length][ciphertext][16-byte tag]`, the length doubling as the AAD, with an
 * incrementing per-direction counter. Partial trailing frames are buffered until completed.
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

    /**
     * Consumes complete encrypted frames from the buffered input and returns their concatenated plaintext.
     *
     * @param chunk - Newly received encrypted bytes.
     * @returns The recovered plaintext (possibly empty if no frame completed).
     */
    decrypt(chunk: Buffer): Buffer {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);

        const out: Buffer[] = [];
        let offset = 0;

        while (offset + 2 <= this.#buffer.length) {
            const frameLength = this.#buffer.readUInt16LE(offset);
            const end = offset + 2 + frameLength + AUTH_TAG_LENGTH;

            if (end > this.#buffer.length) {
                break;
            }

            const aad = this.#buffer.subarray(offset, offset + 2);
            const ciphertext = this.#buffer.subarray(offset + 2, offset + 2 + frameLength);
            const authTag = this.#buffer.subarray(offset + 2 + frameLength, end);

            out.push(Chacha20.decrypt(this.#readKey, nonce(this.#readCount++), aad, ciphertext, authTag));
            offset = end;
        }

        this.#buffer = this.#buffer.subarray(offset);

        return Buffer.concat(out);
    }

    /**
     * Encrypts plaintext into AirPlay frames.
     *
     * @param data - The plaintext to encrypt.
     * @returns The encrypted frames.
     */
    encrypt(data: Buffer): Buffer {
        const out: Buffer[] = [];

        for (let offset = 0; offset < data.length;) {
            const frame = data.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const length = Buffer.allocUnsafe(2);
            length.writeUInt16LE(frame.length, 0);

            const encrypted = Chacha20.encrypt(this.#writeKey, nonce(this.#writeCount++), length, frame);
            out.push(length, encrypted.ciphertext, encrypted.authTag);
        }

        return Buffer.concat(out);
    }
}

/**
 * Relays one AirPlay side-channel (event or data stream) between a controller-facing socket and a
 * device-facing socket. Each side has its own {@link AirPlayCipher} (keyed from the respective pairing's
 * shared secret), so bytes are decrypted on ingress, handed to the logger, and re-encrypted on egress.
 */
export class ChannelRelay {
    readonly #context: Context;
    readonly #controllerSocket: Socket;
    readonly #controllerCipher: AirPlayCipher;
    readonly #deviceSocket: Socket;
    readonly #deviceCipher: AirPlayCipher;
    readonly #logger: RelayLogger;

    /**
     * @param context - Shared context for logging.
     * @param controllerSocket - The socket facing the controller.
     * @param controllerCipher - The cipher for the controller side.
     * @param deviceSocket - The socket facing the real device.
     * @param deviceCipher - The cipher for the device side.
     * @param logger - Invoked with each decrypted chunk for capture.
     */
    constructor(context: Context, controllerSocket: Socket, controllerCipher: AirPlayCipher, deviceSocket: Socket, deviceCipher: AirPlayCipher, logger: RelayLogger) {
        this.#context = context;
        this.#controllerSocket = controllerSocket;
        this.#controllerCipher = controllerCipher;
        this.#deviceSocket = deviceSocket;
        this.#deviceCipher = deviceCipher;
        this.#logger = logger;
    }

    /** Wires up the bidirectional relay. */
    start(): void {
        this.#controllerSocket.on('data', (data: Buffer) => this.#forward('controller->device', data, this.#controllerCipher, this.#deviceCipher, this.#deviceSocket));
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

    /**
     * Decrypts a chunk from one side, logs it, and re-encrypts it onto the other side.
     *
     * @param direction - The travel direction (for logging).
     * @param data - The raw encrypted chunk.
     * @param from - The cipher to decrypt with.
     * @param to - The cipher to re-encrypt with.
     * @param out - The destination socket.
     */
    #forward(direction: RelayDirection, data: Buffer, from: AirPlayCipher, to: AirPlayCipher, out: Socket): void {
        try {
            const plaintext = from.decrypt(data);

            if (plaintext.byteLength === 0) {
                return;
            }

            this.#logger(direction, plaintext);

            if (out.writable) {
                out.write(to.encrypt(plaintext));
            }
        } catch (error) {
            this.#context.logger.warn('[proxy]', `AirPlay channel relay error (${direction})`, (error as Error).message);
        }
    }
}
