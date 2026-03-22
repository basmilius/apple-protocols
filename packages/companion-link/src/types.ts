export type AttentionState =
    | 'unknown'
    | 'asleep'
    | 'screensaver'
    | 'awake'
    | 'idle';

export type TextInputState = {
    readonly isActive: boolean;
    readonly documentText: string;
    readonly isSecure: boolean;
    readonly keyboardType: number;
    readonly autocorrection: boolean;
    readonly autocapitalization: boolean;
};

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
