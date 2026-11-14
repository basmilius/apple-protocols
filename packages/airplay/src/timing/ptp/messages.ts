import { DEFAULT_PORT_NUMBER, decodeHeader, encodeHeader, HeaderFields, PTP_HEADER_LENGTH } from './header';
import { decodeTimestamp, encodeTimestamp, PtpTimestamp } from './timestamp';
import { encodeFollowUpInfoTlv, encodeMessageIntervalRequestTlv } from './tlv';

/** Standard PTPv2 message types (subset that we send or receive). */
export const enum PtpMessageType {
    Sync = 0x00,
    DelayReq = 0x01,
    FollowUp = 0x08,
    DelayResp = 0x09,
    Announce = 0x0B,
    Signaling = 0x0C
}

/**
 * PTPv2 control field values corresponding to each message type.
 * Required for interoperability with PTPv1 receivers; PTPv2-only stacks
 * ignore this field but we fill it in regardless.
 */
const ControlField = {
    Sync: 0x00,
    DelayReq: 0x01,
    FollowUp: 0x02,
    DelayResp: 0x03,
    Management: 0x04,
    AllOthers: 0x05
} as const;

/** Apple/macOS sends transportSpecific = 1 for its PTP messages. */
const TRANSPORT_SPECIFIC = 1;

/** Default priority1 advertised by our grandmaster. */
export const DEFAULT_PRIORITY_1 = 248;

/** Default priority2 advertised by our grandmaster. */
export const DEFAULT_PRIORITY_2 = 128;

/** Default clockClass (applies to all non-primary-reference PTP senders). */
const DEFAULT_CLOCK_CLASS = 248;

/** Default clockAccuracy "unknown" as used by macOS. */
const DEFAULT_CLOCK_ACCURACY = 0xFE;

/** Default offsetScaledLogVariance "unknown" as used by macOS. */
const DEFAULT_OFFSET_SCALED_LOG_VARIANCE = 0xFFFF;

/** Current UTC - TAI offset (leap seconds) as used by macOS PTP. */
const DEFAULT_CURRENT_UTC_OFFSET = 37;

/** Time source "internalOscillator" — what Apple claims when it is the grandmaster. */
const DEFAULT_TIME_SOURCE = 0xA0;

/** log2(interval in seconds) values used in the header of each message type. */
const LogInterval = {
    Sync: -3,          // 125 ms
    Announce: 0,       // 1 s — header field; actual cadence is controlled by the interval timer
    FollowUp: 0,
    DelayReq: 0x7F,
    DelayResp: 0x7F,
    Signaling: 0x7F
} as const;

/** Union type for every decoded PTP message. */
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
 * Encodes a Sync message (two-step: the precise origin timestamp is sent
 * in a following FollowUp). Length = 44 bytes (34 header + 10 timestamp).
 *
 * @param sequenceId - Sequence identifier for this Sync.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @returns The encoded Sync message buffer.
 */
export function encodeSync(sequenceId: number, clockIdentity: Buffer): Buffer {
    const length = PTP_HEADER_LENGTH + 10;
    // flags: two-step (0x0200) + PTP timescale (0x0008).
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
 * preceding Sync. Length = 44 bytes + 30 bytes FollowUpInformation TLV.
 *
 * @param sequenceId - Sequence identifier (must match the preceding Sync).
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param preciseOriginTimestamp - Timestamp at which the Sync was sent.
 * @returns The encoded FollowUp message buffer.
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
 * Encodes an Announce message advertising our grandmaster role. Length = 64 bytes.
 *
 * @param sequenceId - Sequence identifier for this Announce.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity (used as grandmasterIdentity).
 * @param priority1 - Our grandmaster priority1 (default 248 — above "slave-only" but below Apple TVs which use 246).
 * @param priority2 - Our grandmaster priority2 (default 128).
 * @returns The encoded Announce message buffer.
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
 * Encodes a DelayResp message in response to a received DelayReq.
 * Length = 54 bytes (34 header + 10 receiveTimestamp + 10 requestingPortIdentity).
 *
 * @param sequenceId - Sequence identifier copied from the received DelayReq.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param receiveTimestamp - The timestamp at which we observed the DelayReq.
 * @param requestingPortIdentity - The 10-byte source port identity of the DelayReq.
 * @returns The encoded DelayResp message buffer.
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
 * Encodes a Signaling message that asks the peer to stop sending Sync,
 * Announce, and Pdelay messages (MessageIntervalRequest TLV with 0x7E
 * sentinels in all three fields).
 *
 * Used when we yield our master role to a higher-priority peer.
 *
 * @param sequenceId - Sequence identifier for this Signaling message.
 * @param clockIdentity - Our 8-byte EUI-64 clock identity.
 * @param targetPortIdentity - The 10-byte port identity of the peer to address.
 * @returns The encoded Signaling message buffer.
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
 * Decodes a PTP message from the given buffer. Only the message types we
 * actually send or receive are handled; others are returned with a minimal
 * header-only shape (but we don't expose that type here — callers switch
 * on {@link PtpMessageType}).
 *
 * @param buf - The raw UDP packet.
 * @returns The decoded message, or null if the buffer is too short or unknown.
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
