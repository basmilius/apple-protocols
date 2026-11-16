import type { DefaultTheme } from 'vitepress';

function group(text: string, items: [string, string][]): DefaultTheme.SidebarItem {
    return {
        text,
        collapsed: false,
        items: items.map(([label, link]) => ({text: label, link}))
    };
}

// The nav and the reference sidebar list the packages in this order.
const PACKAGES: [string, string][] = [
    ['@apple-protocols/devices', '/reference/devices'],
    ['@apple-protocols/airplay', '/reference/airplay'],
    ['@apple-protocols/airplay/mrp', '/reference/airplay-mrp'],
    ['@apple-protocols/airplay/raop', '/reference/airplay-raop'],
    ['@apple-protocols/airplay/rtsp', '/reference/airplay-rtsp'],
    ['@apple-protocols/companion-link', '/reference/companion-link'],
    ['@apple-protocols/audio-source', '/reference/audio-source'],
    ['@apple-protocols/core', '/reference/core']
];

export const nav: DefaultTheme.NavItem[] = [
    {text: 'Guide', link: '/guide/', activeMatch: '^/guide/'},
    {text: 'Protocols', link: '/protocols/', activeMatch: '^/protocols/'},
    {
        text: 'Reference',
        activeMatch: '^/reference/',
        items: [
            {text: 'All packages', link: '/reference/'},
            ...PACKAGES.map(([name, link]) => ({text: name, link}))
        ]
    },
    {text: 'Diagnostics', link: '/diagnostics', activeMatch: '^/diagnostics'}
];

const guide: DefaultTheme.SidebarItem[] = [
    group('Guide', [
        ['Introduction', '/guide/'],
        ['Installation', '/guide/installation'],
        ['Getting started', '/guide/getting-started']
    ]),
    group('Devices', [
        ['Discovering devices', '/guide/discovery'],
        ['Apple TV and HomePod', '/guide/devices'],
        ['Connection and recovery', '/guide/connection'],
        ['Credentials and pairing', '/guide/pairing'],
        ['Capabilities', '/guide/capabilities'],
        ['Logging and errors', '/guide/logging-and-errors']
    ]),
    group('Control', [
        ['Now playing', '/guide/now-playing'],
        ['Playback', '/guide/playback'],
        ['Remote and touch', '/guide/remote'],
        ['Volume', '/guide/volume'],
        ['Power', '/guide/power'],
        ['Text input', '/guide/text-input'],
        ['Apps, accounts and system', '/guide/apps-and-accounts'],
        ['Multiroom', '/guide/multiroom']
    ]),
    group('Media', [
        ['URLs and audio streams', '/guide/media'],
        ['Apple Music catalog', '/guide/catalog']
    ])
];

const protocols: DefaultTheme.SidebarItem[] = [
    group('Protocols', [
        ['Overview', '/protocols/']
    ]),
    group('AirPlay', [
        ['Sessions and channels', '/protocols/airplay'],
        ['Media Remote (MRP)', '/protocols/mrp'],
        ['URLs and audio streams', '/protocols/airplay-media'],
        ['RAOP', '/protocols/raop'],
        ['RTSP', '/protocols/rtsp']
    ]),
    group('Companion Link', [
        ['Sessions', '/protocols/companion-link']
    ]),
    group('Core', [
        ['Pairing', '/protocols/pairing'],
        ['Discovery', '/protocols/discovery'],
        ['Encoding and crypto', '/protocols/encoding'],
        ['Transport and logging', '/protocols/transport']
    ])
];

const reference: DefaultTheme.SidebarItem[] = [
    group('Reference', [
        ['All packages', '/reference/'],
        ...PACKAGES
    ])
];

export const sidebar: DefaultTheme.SidebarMulti = {
    '/guide/': guide,
    '/protocols/': protocols,
    '/reference/': reference
};
