/**
 * Frame type identifiers for the Companion Link wire protocol.
 * The first byte of every frame header indicates the frame type,
 * which determines how the payload should be parsed and routed.
 */
export const FrameType = {
    Unknown: 0,
    NoOp: 1,

    PairSetupStart: 3,
    PairSetupNext: 4,

    PairVerifyStart: 5,
    PairVerifyNext: 6,

    OPackUnencrypted: 7,
    OPackEncrypted: 8,
    OPackPacked: 9,

    PairingRequest: 10,
    PairingResponse: 11,

    SessionStartRequest: 16,
    SessionStartResponse: 17,
    SessionData: 18,

    FamilyIdentityRequest: 32,
    FamilyIdentityResponse: 33,
    FamilyIdentityUpdate: 34
} as const;

/**
 * Message type identifiers within OPack frames.
 * Stored in the `_t` field of each OPack message to distinguish
 * events, requests and responses.
 */
export const MessageType = {
    Event: 1,
    Request: 2,
    Response: 3
} as const;

/**
 * Frame types whose payloads are OPack-encoded.
 * Used to determine whether a received frame should be decoded with OPack.
 */
export const OPackFrameTypes: number[] = [
    FrameType.PairSetupStart,
    FrameType.PairSetupNext,
    FrameType.PairVerifyStart,
    FrameType.PairVerifyNext,

    FrameType.OPackUnencrypted,
    FrameType.OPackEncrypted,
    FrameType.OPackPacked
];

/**
 * Frame types that belong to the pairing flow (pair-setup and pair-verify).
 * Pairing frames use a special queue identifier since they lack the `_x`
 * exchange correlation field.
 */
export const PairingFrameTypes: number[] = [
    FrameType.PairSetupStart,
    FrameType.PairSetupNext,
    FrameType.PairVerifyStart,
    FrameType.PairVerifyNext
];
