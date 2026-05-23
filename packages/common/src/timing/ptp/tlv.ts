/** IEEE 1588-2008 standard TLV types used on the wire. */
export const TlvType = {
    Management: 0x0001,
    OrganizationExtension: 0x0003,
    RequestUnicastTransmission: 0x0004,
    GrantUnicastTransmission: 0x0005,
    CancelUnicastTransmission: 0x0006,
    AcknowledgeCancelUnicastTransmission: 0x0007
} as const;

/** IEEE 802.1AS Apple-gPTP Organization ID (00:80:C2 = IEEE 802). */
const IEEE_802_1_ORGANIZATION_ID = Buffer.from([0x00, 0x80, 0xC2]);

/** Organization sub-type identifier for the 802.1AS FollowUpInformation TLV. */
const FOLLOW_UP_INFORMATION_SUBTYPE = 1;

/** Organization sub-type identifier for the 802.1AS MessageIntervalRequest TLV. */
const MESSAGE_INTERVAL_REQUEST_SUBTYPE = 2;

/**
 * Encodes an IEEE 802.1AS FollowUpInformation TLV (subtype 1).
 *
 * Sent as a trailer after every FollowUp body. Contains:
 * - `cumulativeScaledRateOffset` — u32 BE
 * - `gmTimeBaseIndicator` — u16 BE
 * - `lastGmPhaseChange` — 12 bytes (scaled-nanoseconds fixed-point)
 * - `scaledLastGmFreqChange` — u32 BE
 *
 * For sender-only roles, zero values are semantically correct and match the
 * values observed from macOS senders.
 *
 * @param cumulativeScaledRateOffset - Cumulative rate offset accumulated across the path.
 * @param gmTimeBaseIndicator - The grandmaster's time-base indicator.
 * @param lastGmPhaseChange - The grandmaster's last phase change (12 bytes).
 * @param scaledLastGmFreqChange - The grandmaster's last frequency change.
 * @returns A buffer containing the encoded TLV (including the 4-byte TLV header).
 */
export function encodeFollowUpInfoTlv(
    cumulativeScaledRateOffset: number = 0,
    gmTimeBaseIndicator: number = 0,
    lastGmPhaseChange: Buffer = Buffer.alloc(12),
    scaledLastGmFreqChange: number = 0
): Buffer {
    if (lastGmPhaseChange.length !== 12) {
        throw new Error('lastGmPhaseChange must be exactly 12 bytes.');
    }

    // 3-byte OUI + 1 byte subtype + 4 + 2 + 12 + 4 = 26 bytes payload.
    const payload = Buffer.alloc(26);

    IEEE_802_1_ORGANIZATION_ID.copy(payload, 0);
    payload[3] = FOLLOW_UP_INFORMATION_SUBTYPE;
    payload.writeUInt32BE(cumulativeScaledRateOffset, 4);
    payload.writeUInt16BE(gmTimeBaseIndicator, 8);
    lastGmPhaseChange.copy(payload, 10);
    payload.writeUInt32BE(scaledLastGmFreqChange, 22);

    const tlv = Buffer.alloc(4 + payload.length);
    tlv.writeUInt16BE(TlvType.OrganizationExtension, 0);
    tlv.writeUInt16BE(payload.length, 2);
    payload.copy(tlv, 4);

    return tlv;
}

/**
 * Encodes an IEEE 802.1AS MessageIntervalRequest TLV (subtype 2).
 *
 * Sent in a Signaling message to request that the peer either adjust or
 * stop sending Sync, Announce, or Pdelay messages. The Rust reference
 * sends this TLV with `0x7E` in all three fields to request a full stop;
 * that is what we do when we yield the master role.
 *
 * @param logLinkDelayInterval - Desired Pdelay interval (signed log2 of seconds; 0x7E stops).
 * @param logTimeSyncInterval - Desired Sync interval (signed log2 of seconds; 0x7E stops).
 * @param logAnnounceInterval - Desired Announce interval (signed log2 of seconds; 0x7E stops).
 * @returns A buffer containing the encoded TLV (including the 4-byte TLV header).
 */
export function encodeMessageIntervalRequestTlv(
    logLinkDelayInterval: number,
    logTimeSyncInterval: number,
    logAnnounceInterval: number
): Buffer {
    // 3 OUI + 1 subtype + 1 + 1 + 1 + 1 flags + 2 reserved = 10 bytes payload.
    const payload = Buffer.alloc(10);

    IEEE_802_1_ORGANIZATION_ID.copy(payload, 0);
    payload[3] = MESSAGE_INTERVAL_REQUEST_SUBTYPE;
    payload.writeInt8(logLinkDelayInterval, 4);
    payload.writeInt8(logTimeSyncInterval, 5);
    payload.writeInt8(logAnnounceInterval, 6);
    payload[7] = 0;

    const tlv = Buffer.alloc(4 + payload.length);
    tlv.writeUInt16BE(TlvType.OrganizationExtension, 0);
    tlv.writeUInt16BE(payload.length, 2);
    payload.copy(tlv, 4);

    return tlv;
}
