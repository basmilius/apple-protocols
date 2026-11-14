import type { EventMap } from '../types';
import { Connection } from './connection';

/**
 * Where the 64-bit little-endian message counter sits in the 12-byte ChaCha20 nonce. Companion
 * Link puts it at offset 0, HAP and AirPlay put it at offset 4 behind four zero bytes.
 */
export type NonceFormat = 'counter-at-0' | 'counter-at-4';

/** Builds the 12-byte ChaCha20-Poly1305 nonce for a message counter. */
export function buildNonce(counter: number, format: NonceFormat): Buffer {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64LE(BigInt(counter), format === 'counter-at-0' ? 0 : 4);

    return nonce;
}

/**
 * Connection that can switch to ChaCha20-Poly1305 once pairing yields keys. Subclasses frame and
 * encrypt with the {@link EncryptionState}, because every protocol frames differently.
 */
export class EncryptionAwareConnection<TEventMap extends EventMap> extends Connection<TEventMap> {
    get isEncrypted(): boolean {
        return !!this.#encryption;
    }

    /** Keys and counters once {@link enableEncryption} ran; for the subclass that frames the messages. */
    protected get encryption(): EncryptionState | undefined {
        return this.#encryption;
    }

    #encryption?: EncryptionState;

    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryption = new EncryptionState(readKey, writeKey);
    }
}

/** Keys and per-direction message counters of one encrypted connection. */
export class EncryptionState {
    readKey: Buffer;
    readCount: number;
    writeKey: Buffer;
    writeCount: number;

    constructor(readKey: Buffer, writeKey: Buffer) {
        this.readCount = 0;
        this.readKey = readKey;
        this.writeCount = 0;
        this.writeKey = writeKey;
    }
}
