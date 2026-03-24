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

export const TouchPhase = {
    Began: 0,
    Moved: 1,
    Ended: 2,
    Cancelled: 3,
    Stationary: 4
} as const;

export type TouchPhaseValue = typeof TouchPhase[keyof typeof TouchPhase];

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
