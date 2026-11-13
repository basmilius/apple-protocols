import { Gamepad2, ListTree, Music, Play, Tv, Volume2 } from 'lucide-react';
import { ICONS } from '@/ui/icons';
import type { PanelDefinition } from './registry';
import { RemotePanel } from './remote/RemotePanel';
import { NowPlayingPanel } from './now-playing/NowPlayingPanel';
import { PlaybackPanel } from './playback/PlaybackPanel';
import { VolumePanel } from './volume/VolumePanel';
import { MultiroomPanel } from './multiroom/MultiroomPanel';
import { StatePanel } from './state/StatePanel';
import { AppleTVPanel } from './appletv/AppleTVPanel';

export const SDK_PANELS: readonly PanelDefinition[] = [
    {
        id: 'remote',
        title: 'Remote',
        icon: Gamepad2,
        appliesTo: context => context.device !== null,
        component: RemotePanel
    },
    {
        id: 'nowplaying',
        title: 'Now playing',
        icon: Music,
        appliesTo: context => context.device !== null,
        component: NowPlayingPanel
    },
    {
        id: 'playback',
        title: 'Playback',
        icon: Play,
        appliesTo: context => context.device !== null,
        component: PlaybackPanel
    },
    {
        id: 'volume',
        title: 'Volume',
        icon: Volume2,
        appliesTo: context => context.device !== null,
        component: VolumePanel
    },
    {
        id: 'multiroom',
        title: 'Multiroom',
        icon: ICONS.multiroom,
        appliesTo: context => context.device !== null,
        component: MultiroomPanel
    },
    {
        id: 'state',
        title: 'State',
        icon: ListTree,
        appliesTo: context => context.device !== null,
        component: StatePanel
    },
    {
        id: 'appletv',
        title: 'Apple TV',
        icon: Tv,
        appliesTo: context => context.device?.deviceType === 'appletv',
        component: AppleTVPanel
    }
];
