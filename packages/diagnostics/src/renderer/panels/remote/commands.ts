import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CornerUpLeft, LayoutGrid, Play, Power, SkipBack, SkipForward, Tv, Volume1, Volume2, VolumeX } from 'lucide-react';
import type { CallRoot } from '@shared/contract';
import type { CompanionHidCommand } from '@/panels/sdk-shared';

/** How long a button stays down before its release counts as a hold instead of a tap. */
export const HOLD_MS = 500;

/** The window a second tap has to land in to become a double press. */
export const DOUBLE_MS = 250;

/** Which path a face button takes to the device. Comparing the two is the point of the switch. */
export type Transport = 'airplay' | 'companionLink';

export type Gesture = 'tap' | 'double' | 'hold';

export type FaceCommand = {
    readonly id: string;
    readonly label: string;
    /** The tooltip, when the label alone does not say what holding does. */
    readonly tooltip?: string;
    readonly icon: LucideIcon;
    /** The key that runs this command while the remote has focus. */
    readonly kbd?: string;
    /** USB HID usage page and usage, which is what the hold variant holds down. */
    readonly page: number;
    readonly usage: number;
    /** The `RemoteController` method a tap runs over AirPlay. */
    readonly path: string;
    /** Replaces `remote.longPress` where the SDK names the held variant, as suspend does under power. */
    readonly holdPath?: string;
    /** A tap is already two presses, which is what the app switcher is. */
    readonly doubleTap?: boolean;
    /** Whether a quick second tap promotes this command to its double press. */
    readonly promotesToDouble?: boolean;
    readonly companion: CompanionHidCommand;
    /** Keys a HomePod has nothing to do with. */
    readonly appleTvOnly?: boolean;
};

export const DPAD_DIRECTIONS: readonly FaceCommand[] = [
    {id: 'up', label: 'Up', icon: ChevronUp, kbd: '↑', page: 1, usage: 0x8c, path: 'remote.up', companion: 'Up', appleTvOnly: true},
    {id: 'right', label: 'Right', icon: ChevronRight, kbd: '→', page: 1, usage: 0x8a, path: 'remote.right', companion: 'Right', appleTvOnly: true},
    {id: 'down', label: 'Down', icon: ChevronDown, kbd: '↓', page: 1, usage: 0x8d, path: 'remote.down', companion: 'Down', appleTvOnly: true},
    {id: 'left', label: 'Left', icon: ChevronLeft, kbd: '←', page: 1, usage: 0x8b, path: 'remote.left', companion: 'Left', appleTvOnly: true}
];

export const DPAD_SELECT: FaceCommand = {
    id: 'select',
    label: 'Select',
    icon: Circle,
    kbd: 'Enter',
    page: 1,
    usage: 0x89,
    path: 'remote.select',
    companion: 'Select',
    appleTvOnly: true
};

/*
 * The nine keys of the Homey widget's grid, in its order: system, then transport, then volume.
 * Power sits in the header instead of the grid, which is where the widget puts its own odd one out.
 */
export const FACE_COMMANDS: readonly FaceCommand[] = [
    {id: 'menu', label: 'Menu', tooltip: 'Menu, hold for the home screen', icon: CornerUpLeft, kbd: 'Esc', page: 1, usage: 0x86, path: 'remote.menu', companion: 'Menu', appleTvOnly: true},
    {id: 'home', label: 'Home', tooltip: 'Home, twice for the app switcher', icon: Tv, kbd: 'H', page: 12, usage: 0x40, path: 'remote.home', promotesToDouble: true, companion: 'Home', appleTvOnly: true},
    {id: 'appSwitcher', label: 'App switcher', icon: LayoutGrid, page: 12, usage: 0x40, path: 'remote.home', doubleTap: true, companion: 'Home', appleTvOnly: true},
    {id: 'previous', label: 'Previous', icon: SkipBack, page: 12, usage: 0xb6, path: 'remote.previous', companion: 'SkipBackward'},
    {id: 'playPause', label: 'Play or pause', icon: Play, kbd: 'Space', page: 12, usage: 0xb0, path: 'remote.playPause', companion: 'PlayPause'},
    {id: 'next', label: 'Next', icon: SkipForward, page: 12, usage: 0xb5, path: 'remote.next', companion: 'SkipForward'},
    {id: 'volumeDown', label: 'Volume down', icon: Volume1, kbd: '-', page: 12, usage: 0xea, path: 'remote.volumeDown', companion: 'VolumeDown'},
    {id: 'mute', label: 'Mute', icon: VolumeX, kbd: 'M', page: 12, usage: 0xe2, path: 'remote.mute', companion: 'Mute'},
    {id: 'volumeUp', label: 'Volume up', icon: Volume2, kbd: '+', page: 12, usage: 0xe9, path: 'remote.volumeUp', companion: 'VolumeUp'}
];

export const POWER_COMMAND: FaceCommand = {
    id: 'power',
    label: 'Power',
    tooltip: 'Wake, hold to suspend',
    icon: Power,
    page: 1,
    usage: 0x83,
    path: 'remote.wake',
    holdPath: 'remote.suspend',
    companion: 'Power',
    appleTvOnly: true
};

/** Which command a key runs while the remote has focus. Scoped to the face, so no modifier. */
export const KEY_BINDINGS: Readonly<Record<string, string>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Enter: 'select',
    Escape: 'menu',
    Backspace: 'menu',
    ' ': 'playPause',
    h: 'home',
    H: 'home',
    '+': 'volumeUp',
    '=': 'volumeUp',
    '-': 'volumeDown',
    _: 'volumeDown',
    m: 'mute',
    M: 'mute'
};

export type CallSpec = {
    readonly root: CallRoot;
    readonly path: string;
    readonly args: readonly unknown[];
};

/**
 * The call one gesture on one face button makes over the chosen transport.
 *
 * @param command - The face button.
 * @param gesture - What the pointer or the keyboard did.
 * @param transport - Which of the two routes the button is wired to.
 * @param heldMs - How long the button was actually held, in milliseconds.
 */
export function callFor(command: FaceCommand, gesture: Gesture, transport: Transport, heldMs: number): CallSpec {
    if (transport === 'companionLink') {
        const doubled = gesture === 'double' || (gesture === 'tap' && command.doubleTap === true);
        const press = gesture === 'hold' ? 'Hold' : (doubled ? 'DoubleTap' : 'SingleTap');

        return {root: 'companionLink', path: 'pressButton', args: [command.companion, press, heldMs]};
    }

    if (gesture === 'hold') {
        if (command.holdPath !== undefined) {
            return {root: 'device', path: command.holdPath, args: []};
        }

        return {root: 'device', path: 'remote.longPress', args: [command.page, command.usage, heldMs]};
    }

    if (gesture === 'double' || command.doubleTap === true) {
        return {root: 'device', path: 'remote.doublePress', args: [command.page, command.usage]};
    }

    return {root: 'device', path: command.path, args: []};
}
