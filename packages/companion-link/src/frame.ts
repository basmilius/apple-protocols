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

export const MessageType = {
    Event: 1,
    Request: 2,
    Response: 3
} as const;

export const OPackFrameTypes: number[] = [
    FrameType.PairSetupStart,
    FrameType.PairSetupNext,
    FrameType.PairVerifyStart,
    FrameType.PairVerifyNext,

    FrameType.OPackUnencrypted,
    FrameType.OPackEncrypted,
    FrameType.OPackPacked
];

export const PairingFrameTypes: number[] = [
    FrameType.PairSetupStart,
    FrameType.PairSetupNext,
    FrameType.PairVerifyStart,
    FrameType.PairVerifyNext
];
