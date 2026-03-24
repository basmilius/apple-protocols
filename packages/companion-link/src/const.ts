export const HidCommand = {
    Up: 1,
    Down: 2,
    Left: 3,
    Right: 4,
    Menu: 5,
    Select: 6,
    Home: 7,
    VolumeUp: 8,
    VolumeDown: 9,
    Siri: 10,
    Screensaver: 11,
    Sleep: 12,
    Wake: 13,
    PlayPause: 14,
    ChannelIncrement: 15,
    ChannelDecrement: 16,
    Guide: 17,
    PageUp: 18,
    PageDown: 19
} as const;

export const MediaControlCommand = {
    Play: 1,
    Pause: 2,
    NextTrack: 3,
    PreviousTrack: 4,
    GetVolume: 5,
    SetVolume: 6,
    SkipBy: 7,
    FastForwardBegin: 8,
    FastForwardEnd: 9,
    RewindBegin: 10,
    RewindEnd: 11,
    GetCaptionSettings: 12,
    SetCaptionSettings: 13
} as const;

export const MediaControlFlag = {
    Play: 0x0001,
    Pause: 0x0002,
    PreviousTrack: 0x0004,
    NextTrack: 0x0008,
    FastForward: 0x0010,
    Rewind: 0x0020,
    Volume: 0x0100,
    SkipForward: 0x0200,
    SkipBackward: 0x0400
} as const;

export type HidCommandKey = keyof typeof HidCommand;
export type MediaControlCommandKey = keyof typeof MediaControlCommand;
