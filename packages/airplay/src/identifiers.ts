import { randomBytes } from 'node:crypto';

/**
 * Generates a random Active-Remote identifier for DACP (Digital Audio Control Protocol).
 * Used in RTSP headers to identify the remote controller.
 *
 * @returns A random 32-bit unsigned integer as a decimal string.
 */
export function generateActiveRemoteId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}

/**
 * Generates a random DACP-ID for identifying this controller in DACP sessions.
 *
 * @returns A random 64-bit integer as an uppercase hexadecimal string.
 */
export function generateDacpId(): string {
    return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Generates a random session identifier for RTSP and AirPlay sessions.
 *
 * @returns A random 32-bit unsigned integer as a decimal string.
 */
export function generateSessionId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}
