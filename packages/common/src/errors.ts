/**
 * Base error class for all Apple protocol errors.
 * All domain-specific errors in this library extend from this class,
 * enabling consumers to catch any protocol error with a single handler.
 */
export class AppleProtocolError extends Error {
    /** @param message - Human-readable description of the error. */
    constructor(message: string) {
        super(message);
        this.name = 'AppleProtocolError';
    }
}

/**
 * Thrown when a TCP connection cannot be established or encounters a fatal error.
 * Parent class for more specific connection errors.
 */
export class ConnectionError extends AppleProtocolError {
    /** @param message - Human-readable description of the connection failure. */
    constructor(message: string) {
        super(message);
        this.name = 'ConnectionError';
    }
}

/** Thrown when a TCP connection attempt exceeds the configured socket timeout. */
export class ConnectionTimeoutError extends ConnectionError {
    /** @param message - Optional custom message; defaults to a standard timeout message. */
    constructor(message: string = 'Connection timed out.') {
        super(message);
        this.name = 'ConnectionTimeoutError';
    }
}

/** Thrown when a TCP connection is closed unexpectedly by the remote end or the OS. */
export class ConnectionClosedError extends ConnectionError {
    /** @param message - Optional custom message; defaults to a standard closed message. */
    constructor(message: string = 'Connection closed unexpectedly.') {
        super(message);
        this.name = 'ConnectionClosedError';
    }
}

/**
 * Thrown when a pairing operation fails during the HAP pair-setup or pair-verify flow.
 * Parent class for authentication and credentials errors.
 */
export class PairingError extends AppleProtocolError {
    /** @param message - Human-readable description of the pairing failure. */
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
    /** @param message - Human-readable description of the authentication failure. */
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
    /** @param message - Human-readable description of the credentials issue. */
    constructor(message: string) {
        super(message);
        this.name = 'CredentialsError';
    }
}

/** Thrown when a protocol command fails to execute on the target device. */
export class CommandError extends AppleProtocolError {
    /** @param message - Human-readable description of the command failure. */
    constructor(message: string) {
        super(message);
        this.name = 'CommandError';
    }
}

/** Thrown when a protocol setup step fails (e.g. RTSP SETUP, AirPlay stream setup). */
export class SetupError extends AppleProtocolError {
    /** @param message - Human-readable description of the setup failure. */
    constructor(message: string) {
        super(message);
        this.name = 'SetupError';
    }
}

/** Thrown when mDNS device discovery fails or a device cannot be found after retries. */
export class DiscoveryError extends AppleProtocolError {
    /** @param message - Human-readable description of the discovery failure. */
    constructor(message: string) {
        super(message);
        this.name = 'DiscoveryError';
    }
}

/** Thrown when an encryption or decryption operation fails (e.g. ChaCha20 auth tag mismatch). */
export class EncryptionError extends AppleProtocolError {
    /** @param message - Human-readable description of the encryption failure. */
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

/** Thrown when a response from the accessory is malformed or has an unexpected format. */
export class InvalidResponseError extends AppleProtocolError {
    /** @param message - Human-readable description of the invalid response. */
    constructor(message: string) {
        super(message);
        this.name = 'InvalidResponseError';
    }
}

/** Thrown when a protocol operation exceeds its expected time limit. */
export class TimeoutError extends AppleProtocolError {
    /** @param message - Human-readable description of the timeout. */
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/** Thrown when a media playback operation fails on the target device. */
export class PlaybackError extends AppleProtocolError {
    /** @param message - Human-readable description of the playback failure. */
    constructor(message: string) {
        super(message);
        this.name = 'PlaybackError';
    }
}
