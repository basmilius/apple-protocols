export class AppleProtocolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AppleProtocolError';
    }
}

export class ConnectionError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'ConnectionError';
    }
}

export class ConnectionTimeoutError extends ConnectionError {
    constructor(message: string = 'Connection timed out.') {
        super(message);
        this.name = 'ConnectionTimeoutError';
    }
}

export class ConnectionClosedError extends ConnectionError {
    constructor(message: string = 'Connection closed unexpectedly.') {
        super(message);
        this.name = 'ConnectionClosedError';
    }
}

export class PairingError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'PairingError';
    }
}

export class AuthenticationError extends PairingError {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class CredentialsError extends PairingError {
    constructor(message: string) {
        super(message);
        this.name = 'CredentialsError';
    }
}

export class CommandError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'CommandError';
    }
}

export class SetupError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'SetupError';
    }
}

export class DiscoveryError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'DiscoveryError';
    }
}

export class EncryptionError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

export class InvalidResponseError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidResponseError';
    }
}

export class TimeoutError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class PlaybackError extends AppleProtocolError {
    constructor(message: string) {
        super(message);
        this.name = 'PlaybackError';
    }
}
