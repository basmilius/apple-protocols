import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowLeftRight, ChartColumn, LayoutDashboard } from 'lucide-react';
import type { DiscoveredDeviceInfo, StateSnapshot } from '@shared/contract';
import { EventsPanel } from './events/EventsPanel';
import { OverviewPanel } from './overview/OverviewPanel';
import { StatisticsPanel } from './statistics/StatisticsPanel';
import { TrafficPanel } from './traffic/TrafficPanel';
import { MEDIA_PANELS } from './registry.media';
import { SDK_PANELS } from './registry.sdk';
import { TOOLS_PANELS } from './registry.tools';

export type PanelProps = {
    /* Null only for a tool in the side panel, which belongs to no device. */
    readonly deviceId: string | null;
};

export type PanelContext = {
    readonly device: DiscoveredDeviceInfo | null;
    readonly snapshot: StateSnapshot | null;
};

export type PanelDefinition = {
    readonly id: string;
    readonly title: string;
    readonly icon: LucideIcon;
    appliesTo(context: PanelContext): boolean;
    readonly component: ComponentType<PanelProps>;
};

export type PanelSection = {
    readonly title: string;
    readonly panels: readonly string[];
};

/** The sidebar of a device, in reading order: what it is, what it does, what goes over the line. */
export const PANEL_SECTIONS: readonly PanelSection[] = [
    {title: 'Device', panels: ['overview', 'connection', 'pairing']},
    {title: 'Control', panels: ['remote', 'nowplaying', 'playback', 'volume', 'multiroom', 'appletv']},
    {title: 'Streaming', panels: ['audio', 'raop']},
    {title: 'Inspect', panels: ['statistics', 'traffic', 'events', 'state', 'raw']}
];

/** Register new panel folders through the SDK, media or tools registries, and a device panel in {@link PANEL_SECTIONS} too. */
export const PANELS: readonly PanelDefinition[] = [
    {
        id: 'overview',
        title: 'Overview',
        icon: LayoutDashboard,
        appliesTo: context => context.device !== null,
        component: OverviewPanel
    },
    {
        id: 'events',
        title: 'Events',
        icon: Activity,
        appliesTo: context => context.device !== null,
        component: EventsPanel
    },
    {
        id: 'traffic',
        title: 'Traffic',
        icon: ArrowLeftRight,
        appliesTo: context => context.device !== null,
        component: TrafficPanel
    },
    {
        id: 'statistics',
        title: 'Statistics',
        icon: ChartColumn,
        appliesTo: context => context.device !== null,
        component: StatisticsPanel
    },
    ...SDK_PANELS,
    ...MEDIA_PANELS,
    ...TOOLS_PANELS
];

export const panelsFor = (context: PanelContext): PanelDefinition[] => PANELS.filter(panel => panel.appliesTo(context));
