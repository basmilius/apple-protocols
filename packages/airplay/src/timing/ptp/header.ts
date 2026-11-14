/** Byte length of a PTPv2 common message header. */
export const PTP_HEADER_LENGTH = 34;

/** PTPv2 protocol version written into every header. */
export const PTP_VERSION = 2;

/** Our sender uses port number 1 (PTPv2 port numbers start at 1). */
export const DEFAULT_PORT_NUMBER = 1;

/** Log message interval sentinel used by PTPv2 Signaling to stop a message stream. */
export const STOP_LOG_INTERVAL = 0x7E;

/** Parsed fields of a PTPv2 common message header. */
export type HeaderFields = {
    messageType: number;
    transportSpecific: number;
    messageLength: number;
    domainNumber: number;
    flags: number;
    correctionField: bigint;
    sourcePortIdentity: Buffer;
    sequenceId: number;
    controlField: number;
    logMessageInterval: number;
};

/**
 * Encodes the fields of a PTPv2 common header into a 34-byte buffer.
 * Unused reserved bytes are left zero — this matches the wire format of
 * macOS/iOS senders and the behaviour of the Rust reference implementation.
 *
 * @param fields - The header fields to encode.
 * @returns A 34-byte header buffer.
 */
export function encodeHeader(fields: HeaderFields): Buffer {
    const buf = Buffer.alloc(PTP_HEADER_LENGTH);

    buf[0] = (fields.messageType & 0x0F) | ((fields.transportSpecific & 0x0F) << 4);
    buf[1] = PTP_VERSION;
    buf.writeUInt16BE(fields.messageLength, 2);
    buf[4] = fields.domainNumber;
    // buf[5] reserved
    buf.writeUInt16BE(fields.flags, 6);
    buf.writeBigInt64BE(fields.correctionField, 8);
    // buf[16..20] reserved
    fields.sourcePortIdentity.copy(buf, 20, 0, 10);
    buf.writeUInt16BE(fields.sequenceId, 30);
    buf[32] = fields.controlField;
    buf.writeInt8(fields.logMessageInterval, 33);

    return buf;
}

/**
 * Decodes a 34-byte PTPv2 common header from the given buffer.
 *
 * @param buf - The buffer to read from (must be at least 34 bytes).
 * @returns The parsed header fields.
 */
export function decodeHeader(buf: Buffer): HeaderFields {
    const messageType = buf[0] & 0x0F;
    const transportSpecific = (buf[0] >> 4) & 0x0F;
    const messageLength = buf.readUInt16BE(2);
    const domainNumber = buf[4];
    const flags = buf.readUInt16BE(6);
    const correctionField = buf.readBigInt64BE(8);
    const sourcePortIdentity = Buffer.from(buf.subarray(20, 30));
    const sequenceId = buf.readUInt16BE(30);
    const controlField = buf[32];
    const logMessageInterval = buf.readInt8(33);

    return {
        messageType,
        transportSpecific,
        messageLength,
        domainNumber,
        flags,
        correctionField,
        sourcePortIdentity,
        sequenceId,
        controlField,
        logMessageInterval
    };
}
