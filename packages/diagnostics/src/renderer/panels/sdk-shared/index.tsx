import { type ReactNode, useState } from 'react';
import { ScrollArea } from '@adecore/ui';
import clsx from 'clsx';
import { RefreshCw, X } from 'lucide-react';
import { Banner, CommandButton, CopyButton, EmptyState, IconButton, ICONS, JsonView, type SelectItem, TextInput } from '@/ui';

/* Shared SDK enum and HID values stay here because `ui/` must not depend on protocol details. */

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

export { PanelBody } from '@/ui';

export function Row({children, className}: { readonly children: ReactNode; readonly className?: string }) {
    return <div className={clsx('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

type NumberInputProps = {
    readonly label: string;
    readonly value: string;
    readonly onValueChange: (value: string) => void;
    readonly placeholder?: string;
    readonly className?: string;
};

/* Keep raw input text so empty values and partially typed `0x` prefixes survive editing. */
export function NumberInput({label, value, onValueChange, placeholder, className}: NumberInputProps) {
    return (
        <TextInput
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
    /* The call behind the label, shown as its tooltip. */
    readonly tooltip?: string;
    readonly disabled?: boolean;
    readonly defaultDepth?: number;
    readonly actions?: ReactNode;
};

/** A getter whose answer is worth keeping on screen rather than in the button's popover. */
export function ResultBlock({label, run, tooltip, disabled, defaultDepth = 2, actions}: ResultBlockProps) {
    const [value, setValue] = useState<unknown>(undefined);

    const load = async (): Promise<unknown> => {
        const next = await run();
        setValue(next);

        return next;
    };

    return (
        <div className={clsx('flex flex-col gap-2', value !== undefined && 'basis-full')}>
            <Row>
                <CommandButton label={label} icon={RefreshCw} tooltip={tooltip} run={load} showResult={false} disabled={disabled}/>
                {actions}
            </Row>
            {value !== undefined && (
                <ScrollArea axis="both" className="max-h-64 rounded-lg bg-code-bg" viewportClassName="relative p-2">
                    <span className="absolute top-1 right-1 flex items-center">
                        <CopyButton text={JSON.stringify(value, null, 4) ?? ''} label="Copy result"/>
                        <IconButton icon={X} label="Close result" size="sm" onClick={() => setValue(undefined)}/>
                    </span>
                    <JsonView value={value} defaultDepth={defaultDepth}/>
                </ScrollArea>
            )}
        </div>
    );
}

/** The line a device page opens with while its session is down; connecting happens from the top row. */
export function NotConnected({children}: { readonly children?: ReactNode }) {
    return (
        <Banner
            placement="inline"
            tone="attention"
            icon={ICONS.disconnect}
            message={children ?? 'Not connected. Connect the device from the top bar to use these commands.'}
        />
    );
}

/** For a device that dropped out of the last scan while one of its pages stayed open. */
export function MissingDevice() {
    return (
        <div className="grid h-full place-items-center">
            <EmptyState icon={ICONS.mdns}>This device is not in the last scan. Rescan to bring it back.</EmptyState>
        </div>
    );
}

export { EventFeed } from './EventFeed';
export { PanelLink } from './PanelLink';
export { setsLevel, VolumeControls, VolumeModePill } from './VolumeControls';
