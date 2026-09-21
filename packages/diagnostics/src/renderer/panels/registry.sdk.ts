import { Gamepad2, Image, ListTree, Play, Speaker, Tv, Volume2 } from 'lucide-react';
import type { PanelDefinition } from './registry';
import { RemotePanel } from './remote/RemotePanel';
import { PlaybackPanel } from './playback/PlaybackPanel';
import { VolumePanel } from './volume/VolumePanel';
import { MultiroomPanel } from './multiroom/MultiroomPanel';
import { StatePanel } from './state/StatePanel';
import { AppleTVPanel } from './appletv/AppleTVPanel';
import { ArtworkPanel } from './artwork/ArtworkPanel';

/** The panels that drive the SDK controllers rather than a protocol or a tool. */
export const SDK_PANELS: readonly PanelDefinition[] = [
    {
        id: 'remote',
        title: 'Remote',
        icon: Gamepad2,
        group: 'general',
        appliesTo: context => context.device !== null,
        component: RemotePanel
    },
    {
        id: 'playback',
        title: 'Playback',
        icon: Play,
        group: 'media',
        appliesTo: context => context.device !== null,
        component: PlaybackPanel
    },
    {
        id: 'volume',
        title: 'Volume',
        icon: Volume2,
        group: 'media',
        appliesTo: context => context.device !== null,
        component: VolumePanel
    },
    {
        id: 'multiroom',
        title: 'Multiroom',
        icon: Speaker,
        group: 'media',
        appliesTo: context => context.device !== null,
        component: MultiroomPanel
    },
    {
        id: 'artwork',
        title: 'Artwork',
        icon: Image,
        group: 'media',
        appliesTo: context => context.device !== null,
        component: ArtworkPanel
    },
    {
        id: 'state',
        title: 'State',
        icon: ListTree,
        group: 'general',
        appliesTo: context => context.device !== null,
        component: StatePanel
    },
    {
        id: 'appletv',
        title: 'Apple TV',
        icon: Tv,
        group: 'general',
        appliesTo: context => context.device?.deviceType === 'appletv',
        component: AppleTVPanel
    }
];
