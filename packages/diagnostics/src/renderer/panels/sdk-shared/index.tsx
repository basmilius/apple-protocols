import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import { CommandButton, EmptyState, Field, JsonView } from '@/ui';
import type { SelectItem } from '@/ui';

/*
 * The pieces every SDK panel repeats. They stay here instead of in `ui/` because they carry
 * knowledge of the SDK surface (enum values, HID usages) rather than of the design system.
 */

/** A protobuf enum member the renderer needs without importing the Node-only proto package. */
export type NamedValue = {
    readonly name: string;
    readonly value: number;
};

const itemsOf = (entries: readonly NamedValue[]): readonly SelectItem<string>[] => entries.map(entry => ({value: entry.name, label: entry.name}));

export const SHUFFLE_MODES: readonly NamedValue[] = [
    {name: 'Unknown', value: 0},
    {name: 'Off', value: 1},
    {name: 'Albums', value: 2},
    {name: 'Songs', value: 3}
];

export const REPEAT_MODES: readonly NamedValue[] = [
    {name: 'Unknown', value: 0},
    {name: 'Off', value: 1},
    {name: 'One', value: 2},
    {name: 'All', value: 3}
];

export const VOLUME_ADJUSTMENTS: readonly NamedValue[] = [
    {name: 'IncrementSmall', value: 1},
    {name: 'IncrementMedium', value: 2},
    {name: 'IncrementLarge', value: 3},
    {name: 'DecrementSmall', value: 4},
    {name: 'DecrementMedium', value: 5},
    {name: 'DecrementLarge', value: 6}
];

/** The subset of `Proto.Command` the free-form sender offers by name. */
export const COMMANDS: readonly NamedValue[] = [
    {name: 'Play', value: 1},
    {name: 'Pause', value: 2},
    {name: 'TogglePlayPause', value: 3},
    {name: 'Stop', value: 4},
    {name: 'NextTrack', value: 5},
    {name: 'PreviousTrack', value: 6},
    {name: 'AdvanceShuffleMode', value: 7},
    {name: 'AdvanceRepeatMode', value: 8},
    {name: 'BeginFastForward', value: 9},
    {name: 'EndFastForward', value: 10},
    {name: 'BeginRewind', value: 11},
    {name: 'EndRewind', value: 12},
    {name: 'SkipForward', value: 18},
    {name: 'SkipBackward', value: 19},
    {name: 'ChangePlaybackRate', value: 20},
    {name: 'RateTrack', value: 21},
    {name: 'LikeTrack', value: 22},
    {name: 'DislikeTrack', value: 23},
    {name: 'BookmarkTrack', value: 24},
    {name: 'NextChapter', value: 25},
    {name: 'PreviousChapter', value: 26},
    {name: 'NextAlbum', value: 27},
    {name: 'PreviousAlbum', value: 28},
    {name: 'NextPlaylist', value: 29},
    {name: 'PreviousPlaylist', value: 30},
    {name: 'BanTrack', value: 31},
    {name: 'AddTrackToWishList', value: 32},
    {name: 'RemoveTrackFromWishList', value: 33},
    {name: 'NextInContext', value: 34},
    {name: 'PreviousInContext', value: 35},
    {name: 'ResetPlaybackTimeout', value: 41},
    {name: 'SeekToPlaybackPosition', value: 45},
    {name: 'ChangeRepeatMode', value: 46},
    {name: 'ChangeShuffleMode', value: 47},
    {name: 'SetPlaybackQueue', value: 48},
    {name: 'AddNowPlayingItemToLibrary', value: 49},
    {name: 'CreateRadioStation', value: 50},
    {name: 'AddItemToLibrary', value: 51},
    {name: 'EnableLanguageOption', value: 53},
    {name: 'DisableLanguageOption', value: 54},
    {name: 'Reshuffle', value: 63},
    {name: 'SetRepeatMode', value: 64},
    {name: 'SetShuffleMode', value: 65},
    {name: 'SetSleepTimer', value: 66},
    {name: 'SetVolume', value: 67},
    {name: 'AdjustVolume', value: 68},
    {name: 'InitiatePlayback', value: 69},
    {name: 'GetPlaybackQueue', value: 71},
    {name: 'GetPlaybackState', value: 72},
    {name: 'EnhanceDialogue', value: 77}
];

/** Page and usage of the keys `RemoteController` sends, so the raw primitives have a starting point. */
export const HID_PRESETS: readonly { readonly name: string; readonly page: number; readonly usage: number }[] = [
    {name: 'Up', page: 1, usage: 0x8c},
    {name: 'Down', page: 1, usage: 0x8d},
    {name: 'Left', page: 1, usage: 0x8b},
    {name: 'Right', page: 1, usage: 0x8a},
    {name: 'Select', page: 1, usage: 0x89},
    {name: 'Menu', page: 1, usage: 0x86},
    {name: 'Suspend', page: 1, usage: 0x82},
    {name: 'Wake', page: 1, usage: 0x83},
    {name: 'Home', page: 12, usage: 0x40},
    {name: 'TopMenu', page: 12, usage: 0x60},
    {name: 'Play', page: 12, usage: 0xb0},
    {name: 'Pause', page: 12, usage: 0xb1},
    {name: 'Stop', page: 12, usage: 0xb7},
    {name: 'NextTrack', page: 12, usage: 0xb5},
    {name: 'PreviousTrack', page: 12, usage: 0xb6},
    {name: 'ChannelUp', page: 12, usage: 0x9c},
    {name: 'ChannelDown', page: 12, usage: 0x9d},
    {name: 'VolumeUp', page: 12, usage: 0xe9},
    {name: 'VolumeDown', page: 12, usage: 0xea},
    {name: 'Mute', page: 12, usage: 0xe2}
];

/** `HidCommand` from `@basmilius/apple-companion-link`, by name. */
export const COMPANION_HID_COMMANDS = [
    'Up',
    'Down',
    'Left',
    'Right',
    'Menu',
    'Select',
    'Home',
    'VolumeUp',
    'VolumeDown',
    'Siri',
    'Screensaver',
    'Sleep',
    'Wake',
    'PlayPause',
    'ChannelIncrement',
    'ChannelDecrement',
    'Guide',
    'PageUp',
    'PageDown',
    'SkipForward',
    'SkipBackward',
    'Back',
    'Exit',
    'Info',
    'CaptionsToggle',
    'Accessibility',
    'InputSelect',
    'Mute',
    'Power'
] as const;

/** So a panel that wires a button to one of these names has it checked rather than spelled. */
export type CompanionHidCommand = (typeof COMPANION_HID_COMMANDS)[number];

export const BUTTON_PRESS_TYPES: readonly string[] = ['SingleTap', 'DoubleTap', 'Hold'];

/** `MediaControlCommand` from `@basmilius/apple-companion-link`, by name. */
export const MEDIA_CONTROL_COMMANDS: readonly string[] = [
    'Play',
    'Pause',
    'NextTrack',
    'PreviousTrack',
    'GetVolume',
    'SetVolume',
    'SkipBy',
    'FastForwardBegin',
    'FastForwardEnd',
    'RewindBegin',
    'RewindEnd',
    'GetCaptionSettings',
    'SetCaptionSettings'
];

export const SHUFFLE_MODE_ITEMS = itemsOf(SHUFFLE_MODES);
export const REPEAT_MODE_ITEMS = itemsOf(REPEAT_MODES);
export const VOLUME_ADJUSTMENT_ITEMS = itemsOf(VOLUME_ADJUSTMENTS);
export const COMMAND_ITEMS = itemsOf(COMMANDS);
export const COMPANION_HID_ITEMS: readonly SelectItem<string>[] = COMPANION_HID_COMMANDS.map(name => ({value: name, label: name}));
export const BUTTON_PRESS_ITEMS: readonly SelectItem<string>[] = BUTTON_PRESS_TYPES.map(name => ({value: name, label: name}));
export const MEDIA_CONTROL_ITEMS: readonly SelectItem<string>[] = MEDIA_CONTROL_COMMANDS.map(name => ({value: name, label: name}));

/** Looks a named enum member up, falling back to the first entry so a call never sends `undefined`. */
export function valueOf(entries: readonly NamedValue[], name: string): number {
    return entries.find(entry => entry.name === name)?.value ?? entries[0]?.value ?? 0;
}

/** Parses a typed field, accepting `0x` for the HID usages that are documented in hex. */
export function numberOf(text: string, fallback: number): number {
    const trimmed = text.trim();
    const parsed = /^0x/i.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number(trimmed);

    return Number.isFinite(parsed) ? parsed : fallback;
}

export function hex(value: number): string {
    return `0x${value.toString(16).padStart(2, '0')}`;
}

/** The scroll container every SDK panel is wrapped in, so their paddings line up. */
export { PanelBody } from '@/ui';

export function Row({children, className}: { readonly children: ReactNode; readonly className?: string }) {
    return <div className={clsx('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** An inline caption in front of a control, which a section header is too far away to give. */
export function Labeled({label, children}: { readonly label: string; readonly children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-text-muted">{label}</span>
            {children}
        </span>
    );
}

type NumberInputProps = {
    readonly label: string;
    readonly value: string;
    readonly onValueChange: (value: string) => void;
    readonly placeholder?: string;
    readonly className?: string;
};

/* The value stays a string while it is being typed: a field that reparses on every key cannot hold
   an empty box or a half-written `0x`. */
export function NumberInput({label, value, onValueChange, placeholder, className}: NumberInputProps) {
    return (
        <Field
            label={label}
            mono
            value={value}
            placeholder={placeholder}
            inputMode="numeric"
            className={clsx('h-7 w-20', className)}
            onChange={event => onValueChange(event.target.value)}
        />
    );
}

type ResultBlockProps = {
    readonly label: string;
    readonly run: () => Promise<unknown>;
    readonly disabled?: boolean;
    readonly defaultDepth?: number;
    readonly actions?: ReactNode;
};

/** A getter whose answer is worth keeping on screen rather than in the button's popover. */
export function ResultBlock({label, run, disabled, defaultDepth = 2, actions}: ResultBlockProps) {
    const [value, setValue] = useState<unknown>(undefined);

    const load = async (): Promise<unknown> => {
        const next = await run();
        setValue(next);

        return next;
    };

    return (
        <div className="flex flex-col gap-2">
            <Row>
                <CommandButton label={label} run={load} disabled={disabled}/>
                {actions}
            </Row>
            {value !== undefined && (
                <div className="max-h-64 overflow-auto rounded-lg border border-border bg-code-bg p-2">
                    <JsonView value={value} defaultDepth={defaultDepth}/>
                </div>
            )}
        </div>
    );
}

/** What every SDK panel shows before its device is reachable. */
export function NotConnected({children}: { readonly children?: ReactNode }) {
    return <EmptyState className="py-6">{children ?? 'Connect the device to use these commands.'}</EmptyState>;
}
