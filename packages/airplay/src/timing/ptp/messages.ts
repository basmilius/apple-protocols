import { DEFAULT_PORT_NUMBER, decodeHeader, encodeHeader, HeaderFields, PTP_HEADER_LENGTH } from './header';
import { decodeTimestamp, encodeTimestamp, PtpTimestamp } from './timestamp';
import { encodeFollowUpInfoTlv, encodeMessageIntervalRequestTlv } from './tlv';

/** The PTPv2 message types we send or receive. */
export const enum PtpMessageType {
    Sync = 0x00,
    DelayReq = 0x01,
    FollowUp = 0x08,
    DelayResp = 0x09,
    Announce = 0x0B,
    Signaling = 0x0C
}

/**
 * PTPv2 control field per message type. PTPv1 receivers need it; PTPv2-only
 * stacks ignore it.
 */
const ControlField = {
    Sync: 0x00,
    DelayReq: 0x01,
    FollowUp: 0x02,
    DelayResp: 0x03,
    Management: 0x04,
    AllOthers: 0x05
} as const;

/** macOS sends transportSpecific = 1 in its PTP messages. */
const TRANSPORT_SPECIFIC = 1;

/** Default priority1 advertised by our grandmaster. */
export const DEFAULT_PRIORITY_1 = 248;

/** Default priority2 advertised by our grandmaster. */
export const DEFAULT_PRIORITY_2 = 128;

/** clockClass of every PTP sender that is not a primary reference. */
const DEFAULT_CLOCK_CLASS = 248;

/** clockAccuracy "unknown", as macOS sends it. */
const DEFAULT_CLOCK_ACCURACY = 0xFE;

/** offsetScaledLogVariance "unknown", as macOS sends it. */
const DEFAULT_OFFSET_SCALED_LOG_VARIANCE = 0xFFFF;

/** UTC to TAI offset in leap seconds, as macOS sends it. */
const DEFAULT_CURRENT_UTC_OFFSET = 37;

/** Time source "internalOscillator", which Apple claims as grandmaster. */
const DEFAULT_TIME_SOURCE = 0xA0;

/** log2 of the interval in seconds, written in the header of each message type. */
const LogInterval = {
    Sync: -3,          // 125 ms
    Announce: 0,       // 1 s in the header; the interval timer sets the real cadence
    FollowUp: 0,
    DelayReq: 0x7F,
    DelayResp: 0x7F,
    Signaling: 0x7F
} as const;

/** A decoded PTP message, discriminated by `type`. */
export type DecodedPtpMessage =
    | { type: PtpMessageType.Sync; header: HeaderFields; body: { originTimestamp: PtpTimestamp } }
    | { type: PtpMessageType.DelayReq; header: HeaderFields; body: { originTimestamp: PtpTimestamp } }
    | { type: PtpMessageType.FollowUp; header: HeaderFields; body: { preciseOriginTimestamp: PtpTimestamp } }
    | {
        type: PtpMessageType.DelayResp;
        header: HeaderFields;
        body: { receiveTimestamp: PtpTimestamp; requestingPortIdentity: Buffer }
    }
    | { type: PtpMessageType.Announce; header: HeaderFields; body: AnnounceBody }
    | {
        type: PtpMessageType.Signaling;
        header: HeaderFields;
        body: { targetPortIdentity: Buffer; tlv: Buffer }
    };

/** Parsed Announce body fields. */
export type AnnounceBody = {
    originTimestamp: PtpTimestamp;
    currentUtcOffset: number;
    grandmasterPriority1: number;
    grandmasterClockQuality: {
        clockClass: number;
        clockAccuracy: number;
        offsetScaledLogVariance: number;
    };
    grandmasterPriority2: number;
    grandmasterIdentity: Buffer;
    stepsRemoved: number;
    timeSource: number;
};

function buildHeader(
    messageType: PtpMessageType,
    clockIdentity: Buffer,
    sequenceId: number,
    messageLength: number,
    controlField: number,
    logMessageInterval: number,
    flags: number = 0
): Buffer {
    const sourcePortIdentity = Buffer.alloc(10);

    clockIdentity.copy(sourcePortIdentity, 0, 0, 8);
    sourcePortIdentity.writeUInt16BE(DEFAULT_PORT_NUMBER, 8);

    return encodeHeader({
        messageType,
        transportSpecific: TRANSPORT_SPECIFIC,
        messageLength,
        domainNumber: 0,
        flags,
        correctionField: 0n,
        sourcePortIdentity,
        sequenceId,
        controlField,
        logMessageInterval
    });
}

/**
 * Encodes a two-step Sync message of 44 bytes (34 header, 10 timestamp). The
 * precise origin timestamp follows in a FollowUp.
 *
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 */
export function encodeSync(sequenceId: number, clockIdentity: Buffer): Buffer {
    const length = PTP_HEADER_LENGTH + 10;

    // Flags are two-step (0x0200) and PTP timescale (0x0008).
    const header = buildHeader(
        PtpMessageType.Sync,
        clockIdentity,
        sequenceId,
        length,
        ControlField.Sync,
        LogInterval.Sync,
        0x0208
    );

    const zeroTs = encodeTimestamp({seconds: 0n, nanoseconds: 0});

    return Buffer.concat([header, zeroTs]);
}

/**
 * Encodes a FollowUp message carrying the precise origin timestamp for the
 * preceding Sync: 44 bytes plus a 30-byte FollowUpInformation TLV.
 *
 * @param sequenceId - Must match the preceding Sync.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param preciseOriginTimestamp - When the Sync was sent.
 */
export function encodeFollowUp(
    sequenceId: number,
    clockIdentity: Buffer,
    preciseOriginTimestamp: PtpTimestamp
): Buffer {
    const timestamp = encodeTimestamp(preciseOriginTimestamp);
    const tlv = encodeFollowUpInfoTlv();
    const length = PTP_HEADER_LENGTH + timestamp.length + tlv.length;

    const header = buildHeader(
        PtpMessageType.FollowUp,
        clockIdentity,
        sequenceId,
        length,
        ControlField.FollowUp,
        LogInterval.FollowUp,
        0x0008
    );

    return Buffer.concat([header, timestamp, tlv]);
}

/**
 * Encodes a 64-byte Announce message advertising our grandmaster role.
 *
 * @param clockIdentity - Our 8-byte EUI-64 clock identity, also the grandmasterIdentity.
 * @param priority1 - Grandmaster priority1; the default 248 is above "slave-only" and below the 246 of an Apple TV.
 */
export function encodeAnnounce(
    sequenceId: number,
    clockIdentity: Buffer,
    priority1: number = DEFAULT_PRIORITY_1,
    priority2: number = DEFAULT_PRIORITY_2
): Buffer {
    const length = PTP_HEADER_LENGTH + 10 + 20;

    const header = buildHeader(
        PtpMessageType.Announce,
        clockIdentity,
        sequenceId,
        length,
        ControlField.AllOthers,
        LogInterval.Announce,
        0x0008
    );

    const zeroTs = encodeTimestamp({seconds: 0n, nanoseconds: 0});
    const body = Buffer.alloc(20);

    body.writeInt16BE(DEFAULT_CURRENT_UTC_OFFSET, 0);
    // body[2] reserved
    body[3] = priority1;
    body[4] = DEFAULT_CLOCK_CLASS;
    body[5] = DEFAULT_CLOCK_ACCURACY;
    body.writeUInt16BE(DEFAULT_OFFSET_SCALED_LOG_VARIANCE, 6);
    body[8] = priority2;
    clockIdentity.copy(body, 9, 0, 8);
    body.writeUInt16BE(0, 17);
    body[19] = DEFAULT_TIME_SOURCE;

    return Buffer.concat([header, zeroTs, body]);
}

/**
 * Encodes a 54-byte DelayResp message that answers a DelayReq: 34 header,
 * 10 receiveTimestamp and 10 requestingPortIdentity.
 *
 * @param sequenceId - Copied from the DelayReq.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param receiveTimestamp - When we received the DelayReq.
 * @param requestingPortIdentity - The 10-byte source port identity of the DelayReq.
 */
export function encodeDelayResp(
    sequenceId: number,
    clockIdentity: Buffer,
    receiveTimestamp: PtpTimestamp,
    requestingPortIdentity: Buffer
): Buffer {
    const timestamp = encodeTimestamp(receiveTimestamp);
    const length = PTP_HEADER_LENGTH + timestamp.length + 10;

    const header = buildHeader(
        PtpMessageType.DelayResp,
        clockIdentity,
        sequenceId,
        length,
        ControlField.DelayResp,
        LogInterval.DelayResp,
        0x0008
    );

    const requester = Buffer.alloc(10);

    requestingPortIdentity.copy(requester, 0, 0, 10);

    return Buffer.concat([header, timestamp, requester]);
}

/**
 * Encodes a Signaling message that asks the peer to stop its Sync, Announce
 * and Pdelay messages, with 0x7E in all three fields of a MessageIntervalRequest
 * TLV. We send it when we yield the master role to a peer with a higher priority.
 *
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param targetPortIdentity - The 10-byte port identity of the peer.
 */
export function encodeSignalingStop(
    sequenceId: number,
    clockIdentity: Buffer,
    targetPortIdentity: Buffer
): Buffer {
    const tlv = encodeMessageIntervalRequestTlv(0x7E, 0x7E, 0x7E);
    const target = Buffer.alloc(10);

    targetPortIdentity.copy(target, 0, 0, 10);

    const length = PTP_HEADER_LENGTH + target.length + tlv.length;

    const header = buildHeader(
        PtpMessageType.Signaling,
        clockIdentity,
        sequenceId,
        length,
        ControlField.AllOthers,
        LogInterval.Signaling,
        0x0008
    );

    return Buffer.concat([header, target, tlv]);
}

/**
 * Decodes a PTP message from a raw UDP packet. Only the types in
 * {@link PtpMessageType} decode.
 *
 * @returns The decoded message, or null for a short buffer or an unknown type.
 */
export function decodeMessage(buf: Buffer): DecodedPtpMessage | null {
    if (buf.length < PTP_HEADER_LENGTH) {
        return null;
    }

    const header = decodeHeader(buf);
    const offset = PTP_HEADER_LENGTH;

    switch (header.messageType) {
        case PtpMessageType.Sync: {
            if (buf.length < offset + 10) {
                return null;
            }

            return {
                type: PtpMessageType.Sync,
                header,
                body: {originTimestamp: decodeTimestamp(buf, offset)}
            };
        }

        case PtpMessageType.DelayReq: {
            if (buf.length < offset + 10) {
                return null;
            }

            return {
                type: PtpMessageType.DelayReq,
                header,
                body: {originTimestamp: decodeTimestamp(buf, offset)}
            };
        }

        case PtpMessageType.FollowUp: {
            if (buf.length < offset + 10) {
                return null;
            }

            return {
                type: PtpMessageType.FollowUp,
                header,
                body: {preciseOriginTimestamp: decodeTimestamp(buf, offset)}
            };
        }

        case PtpMessageType.DelayResp: {
            if (buf.length < offset + 10 + 10) {
                return null;
            }

            return {
                type: PtpMessageType.DelayResp,
                header,
                body: {
                    receiveTimestamp: decodeTimestamp(buf, offset),
                    requestingPortIdentity: Buffer.from(buf.subarray(offset + 10, offset + 20))
                }
            };
        }

        case PtpMessageType.Announce: {
            if (buf.length < offset + 10 + 20) {
                return null;
            }

            const originTimestamp = decodeTimestamp(buf, offset);
            const bodyOffset = offset + 10;
            const currentUtcOffset = buf.readInt16BE(bodyOffset);
            const grandmasterPriority1 = buf[bodyOffset + 3];
            const clockClass = buf[bodyOffset + 4];
            const clockAccuracy = buf[bodyOffset + 5];
            const offsetScaledLogVariance = buf.readUInt16BE(bodyOffset + 6);
            const grandmasterPriority2 = buf[bodyOffset + 8];
            const grandmasterIdentity = Buffer.from(buf.subarray(bodyOffset + 9, bodyOffset + 17));
            const stepsRemoved = buf.readUInt16BE(bodyOffset + 17);
            const timeSource = buf[bodyOffset + 19];

            return {
                type: PtpMessageType.Announce,
                header,
                body: {
                    originTimestamp,
                    currentUtcOffset,
                    grandmasterPriority1,
                    grandmasterClockQuality: {
                        clockClass,
                        clockAccuracy,
                        offsetScaledLogVariance
                    },
                    grandmasterPriority2,
                    grandmasterIdentity,
                    stepsRemoved,
                    timeSource
                }
            };
        }

        case PtpMessageType.Signaling: {
            if (buf.length < offset + 10) {
                return null;
            }

            const targetPortIdentity = Buffer.from(buf.subarray(offset, offset + 10));
            const tlv = Buffer.from(buf.subarray(offset + 10));

            return {
                type: PtpMessageType.Signaling,
                header,
                body: {
                    targetPortIdentity,
                    tlv
                }
            };
        }

        default:
            return null;
    }
}
