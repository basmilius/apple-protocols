import { randomBytes } from 'node:crypto';

/**
 * Generates a random DACP Active-Remote identifier for the RTSP headers: a
 * 32-bit unsigned integer as a decimal string.
 */
export function generateActiveRemoteId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}

/** Generates a random DACP-ID: a 64-bit integer as an uppercase hex string. */
export function generateDacpId(): string {
    return randomBytes(8).toString('hex').toUpperCase();
}

/** Generates a random RTSP session identifier: a 32-bit unsigned integer as a decimal string. */
export function generateSessionId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}
