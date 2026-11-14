import type { EventMap } from '@corewire/core';
import { type Connection, type Context, EncryptionAwareConnection } from '@corewire/core/transport';
import { chacha20DecryptFrames, chacha20Encrypt } from './encryption';

/** Upper bound for both receive buffers; a peer that sends more is broken or hostile. */
const MAX_BUFFER_SIZE = 4 * 1024 * 1024;

/** The ChaCha20-Poly1305 keys of one channel, named from our side. */
export type ChannelKeys = {
    readonly readKey: Buffer;
    readonly writeKey: Buffer;
};

/**
 * A TCP channel next to the control channel that is encrypted from its first byte, in AirPlay's
 * frame format (2-byte LE length as AAD, nonce with the counter at offset 4).
 *
 * Ciphertext and plaintext have separate buffers: a partial TCP delivery leaves ciphertext waiting
 * until its frame is complete, so it can never end up in the plaintext a subclass parses. A frame
 * that does not decrypt or parse ends the channel with reason `error`.
 */
export abstract class EncryptedChannel<TEventMap extends EventMap = {}> extends EncryptionAwareConnection<TEventMap> {
    #buffer: Buffer = Buffer.alloc(0);
    #encryptedBuffer: Buffer = Buffer.alloc(0);

    protected constructor(context: Context, address: string, port: number, keys: ChannelKeys) {
        super(context, address, port);

        this.enableEncryption(keys.readKey, keys.writeKey);

        // The generic event map hides the base events from the listener signatures.
        const connection = this as unknown as Connection;
        connection.on('data', (data: Buffer) => this.#onData(data));
        connection.on('closed', () => this.#reset());
    }

    /** Encrypts and writes a plaintext frame. */
    protected writeEncrypted(data: Buffer): void {
        this.write(chacha20Encrypt(this._encryption, data));
    }

    /**
     * Parses complete messages at the start of the plaintext buffer.
     *
     * @returns The number of bytes consumed; the rest waits for more data.
     * @throws When a message is malformed, which ends the channel.
     */
    protected abstract receive(plaintext: Buffer, received: number): number;

    #onData(data: Buffer): void {
        try {
            if (this.#encryptedBuffer.length + data.length > MAX_BUFFER_SIZE) {
                throw new Error('Encrypted stream buffer limit exceeded.');
            }

            this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, data]);

            const decrypted = chacha20DecryptFrames(this._encryption, this.#encryptedBuffer);
            this.#encryptedBuffer = Buffer.from(this.#encryptedBuffer.subarray(decrypted.consumed));
            this.#buffer = Buffer.concat([this.#buffer, decrypted.data]);

            if (this.#buffer.length > MAX_BUFFER_SIZE) {
                throw new Error('Plaintext stream buffer limit exceeded.');
            }

            const consumed = this.receive(this.#buffer, data.byteLength);
            this.#buffer = this.#buffer.subarray(consumed);
        } catch (err) {
            this.#reset();
            this.context.logger.error(`[${this.constructor.name}]`, 'Failed to read from the channel.', err);
            this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
    }

    #reset(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);
    }
}
