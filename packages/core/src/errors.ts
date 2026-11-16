/** Base class of the Apple Protocols errors, so one `instanceof` check catches all of them. */
export class AppleProtocolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AppleProtocolError';
    }
}

/** Thrown when a TCP connection fails to open or breaks. */
export class ConnectionError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'ConnectionError';
    }
}

/** Thrown when a TCP connection attempt exceeds the configured socket timeout. */
export class ConnectionTimeoutError extends ConnectionError {
    constructor(message: string = 'Connection timed out.') {
        super(message);
        this.name = 'ConnectionTimeoutError';
    }
}

/** Thrown when a connection or session closes before an operation finishes, or when an operation runs on a closed one. */
export class ConnectionClosedError extends ConnectionError {
    constructor(message: string = 'Connection closed unexpectedly.') {
        super(message);
        this.name = 'ConnectionClosedError';
    }
}

/** Thrown when a HAP pair-setup or pair-verify fails. */
export class PairingError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'PairingError';
    }
}

/**
 * Thrown when the accessory's identity verification fails, such as an invalid
 * Ed25519 signature or mismatched accessory identifier during pair-verify.
 */
export class AuthenticationError extends PairingError {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

/**
 * Thrown when stored credentials are invalid, missing, or incompatible
 * with the accessory (e.g. after a factory reset).
 */
export class CredentialsError extends PairingError {
    constructor(message: string) {
        super(message);
        this.name = 'CredentialsError';
    }
}

/** Thrown when a protocol command fails to execute on the target device. */
export class CommandError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'CommandError';
    }
}

/** Thrown when a protocol setup step fails (e.g. an RTSP SETUP). */
export class SetupError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'SetupError';
    }
}

/** Thrown when mDNS device discovery fails or a device cannot be found after retries. */
export class DiscoveryError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'DiscoveryError';
    }
}

/** Thrown when encrypting or decrypting a message fails. */
export class EncryptionError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

/** Thrown when a response from the accessory is malformed or has an unexpected format. */
export class InvalidResponseError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidResponseError';
    }
}

/** Thrown when a protocol operation exceeds its expected time limit. */
export class TimeoutError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/** Thrown when a media playback operation fails on the target device. */
export class PlaybackError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'PlaybackError';
    }
}

/** Thrown when the authentication tag of a ChaCha20-Poly1305 message does not match, because the ciphertext changed or the key or nonce is wrong. */
export class DecryptionError extends EncryptionError {
    constructor(message: string = 'Decryption failed: authentication tag mismatch') {
        super(message);
        this.name = 'DecryptionError';
    }
}

/** Thrown when the accessory answers a pairing message with a TLV8 error or back-off. */
export class TLV8PairingError extends PairingError {
    /** The TLV8 error code of the accessory; undefined when it sent none. */
    readonly code: number | undefined;

    constructor(message: string, code?: number) {
        super(message);
        this.name = 'TLV8PairingError';
        this.code = code;
    }
}
