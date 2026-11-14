import type { HidCommandKey } from '@corewire/companion-link';
import type { RemoteKey } from '../types';

const GENERIC_DESKTOP = 1;
const CONSUMER = 12;

/** The AirPlay HID usage of a key, for the presses MRP sends. */
export const AIRPLAY_KEYS: Partial<Record<RemoteKey, readonly [page: number, usage: number]>> = {
    up: [GENERIC_DESKTOP, 0x8C],
    down: [GENERIC_DESKTOP, 0x8D],
    left: [GENERIC_DESKTOP, 0x8B],
    right: [GENERIC_DESKTOP, 0x8A],
    menu: [GENERIC_DESKTOP, 0x86],
    select: [GENERIC_DESKTOP, 0x89],
    home: [CONSUMER, 0x40],
    suspend: [GENERIC_DESKTOP, 0x82],
    wake: [GENERIC_DESKTOP, 0x83],
    play: [CONSUMER, 0xB0],
    pause: [CONSUMER, 0xB1],
    playPause: [CONSUMER, 0xB0],
    stop: [CONSUMER, 0xB7],
    next: [CONSUMER, 0xB5],
    previous: [CONSUMER, 0xB6],
    volumeUp: [CONSUMER, 0xE9],
    volumeDown: [CONSUMER, 0xEA],
    mute: [CONSUMER, 0xE2],
    topMenu: [CONSUMER, 0x60],
    channelUp: [CONSUMER, 0x9C],
    channelDown: [CONSUMER, 0x9D]
};

/** The Companion Link HID command of a key. */
export const COMPANION_LINK_KEYS: Partial<Record<RemoteKey, HidCommandKey>> = {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    select: 'Select',
    menu: 'Menu',
    home: 'Home',
    playPause: 'PlayPause',
    volumeUp: 'VolumeUp',
    volumeDown: 'VolumeDown',
    mute: 'Mute',
    channelUp: 'ChannelIncrement',
    channelDown: 'ChannelDecrement',
    wake: 'Wake',
    suspend: 'Sleep',
    siri: 'Siri',
    screensaver: 'Screensaver',
    guide: 'Guide',
    pageUp: 'PageUp',
    pageDown: 'PageDown',
    info: 'Info',
    captions: 'CaptionsToggle',
    power: 'Power',
    back: 'Back',
    exit: 'Exit',
    skipForward: 'SkipForward',
    skipBackward: 'SkipBackward'
};
