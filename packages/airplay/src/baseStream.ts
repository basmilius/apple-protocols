import { EncryptionAwareConnection, type EventMap } from '@basmilius/apple-common';
import { chacha20Decrypt, chacha20Encrypt } from './encryption';

/**
 * Default events emitted by all AirPlay streams.
 */
type DefaultEventMap = {
    close: [];
    connect: [];
    error: [Error];
    timeout: [];
};

/**
 * Base class for AirPlay encrypted TCP streams (DataStream, EventStream).
 *
 * Extends {@link EncryptionAwareConnection} with AirPlay-specific ChaCha20
 * encryption that uses length-prefixed frames and a 12-byte nonce with a
 * 4-byte zero prefix followed by an 8-byte little-endian counter.
 */
export default class BaseStream<TEventMap extends EventMap = {}> extends EncryptionAwareConnection<DefaultEventMap & TEventMap> {
    /**
     * Decrypts incoming data using AirPlay's ChaCha20 frame format.
     *
     * @param data - Raw encrypted data from the TCP socket.
     * @returns Decrypted plaintext buffer, or `false` if the data is incomplete (partial frame).
     */
    decrypt(data: Buffer): Buffer | false {
        return chacha20Decrypt(this._encryption, data);
    }

    /**
     * Encrypts outgoing data using AirPlay's ChaCha20 frame format.
     *
     * Splits data into 1024-byte frames, each prefixed with a 2-byte LE length
     * and suffixed with a 16-byte Poly1305 auth tag.
     *
     * @param data - Plaintext data to encrypt.
     * @returns Encrypted buffer ready for transmission.
     */
    encrypt(data: Buffer): Buffer {
        return chacha20Encrypt(this._encryption, data);
    }
}
