import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, LayoutDashboard, Sparkles } from 'lucide-react';
import type { DiscoveredDeviceInfo, StateSnapshot } from '@shared/contract';
import { EventsPanel } from './events/EventsPanel';
import { OverviewPanel } from './overview/OverviewPanel';
import { WelcomePanel } from './welcome/WelcomePanel';
import { MEDIA_PANELS } from './registry.media';
import { SDK_PANELS } from './registry.sdk';
import { TOOLS_PANELS } from './registry.tools';

export type PanelGroup = 'general' | 'protocol' | 'media' | 'tools';

export type PanelProps = {
    /* Null only for a panel that applies to no device, such as the welcome cell. */
    readonly deviceId: string | null;
};

/** What a panel is asked about before it is offered for a device. */
export type PanelContext = {
    readonly device: DiscoveredDeviceInfo | null;
    readonly snapshot: StateSnapshot | null;
};

export type PanelDefinition = {
    readonly id: string;
    readonly title: string;
    readonly icon: LucideIcon;
    readonly group: PanelGroup;
    /** Whether this panel is worth offering for the device in the cell. */
    appliesTo(context: PanelContext): boolean;
    readonly component: ComponentType<PanelProps>;
};

export const PANEL_GROUP_LABELS: Record<PanelGroup, string> = {
    general: 'General',
    protocol: 'Protocol',
    media: 'Media',
    tools: 'Tools'
};

/**
 * Every panel the grid can show. A new panel is a folder under `panels/<id>/` and one entry here;
 * nothing else in the shell knows panels by name.
 */
export const PANELS: readonly PanelDefinition[] = [
    {
        id: 'welcome',
        title: 'Welcome',
        icon: Sparkles,
        group: 'general',
        appliesTo: context => context.device === null,
        component: WelcomePanel
    },
    {
        id: 'overview',
        title: 'Overview',
        icon: LayoutDashboard,
        group: 'general',
        appliesTo: context => context.device !== null,
        component: OverviewPanel
    },
    {
        id: 'events',
        title: 'Events',
        icon: Activity,
        group: 'protocol',
        appliesTo: context => context.device !== null,
        component: EventsPanel
    },
    ...SDK_PANELS,
    ...MEDIA_PANELS,
    ...TOOLS_PANELS
];

export const panelIds = (): string[] => PANELS.map(panel => panel.id);

export const panelById = (id: string): PanelDefinition | null => PANELS.find(panel => panel.id === id) ?? null;

export const panelsFor = (context: PanelContext): PanelDefinition[] => PANELS.filter(panel => panel.appliesTo(context));
