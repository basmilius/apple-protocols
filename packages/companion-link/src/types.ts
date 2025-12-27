export type AttentionState =
    | 'unknown'
    | 'asleep'
    | 'screensaver'
    | 'awake'
    | 'idle';

export type ButtonPressType =
    | 'DoubleTap'
    | 'Hold'
    | 'SingleTap';

export type LaunchableApp = {
    readonly bundleId: string;
    readonly name: string;
};

export type UserAccount = {
    readonly accountId: string;
    readonly name: string;
};
