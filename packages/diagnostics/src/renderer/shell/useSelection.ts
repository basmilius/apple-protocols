import { useMemo } from 'react';
import type { DiscoveredDeviceInfo } from '@shared/contract';
import { useDevices } from '@/state/devices';
import { currentPanel, DEFAULT_PANEL, useLayout } from '@/state/layout';
import { type PanelDefinition, PANEL_SECTIONS, panelsFor } from '@/panels/registry';

export type SelectionSection = {
    readonly title: string;
    readonly panels: readonly PanelDefinition[];
};

export type Selection = {
    /** Null while no device is picked, and while the picked one is not in the scan. */
    readonly device: DiscoveredDeviceInfo | null;
    readonly sections: readonly SelectionSection[];
    readonly panel: PanelDefinition | null;
};

/** The selected device, the panels that apply to it, and the one it shows. */
export function useSelection(): Selection {
    const devices = useDevices(state => state.devices);
    const deviceId = useLayout(state => state.deviceId);
    const panelId = useLayout(currentPanel);
    const device = deviceId === null ? null : (devices.find(candidate => candidate.id === deviceId) ?? null);
    const snapshot = useDevices(state => (device === null ? null : (state.snapshots[device.id] ?? null)));

    return useMemo(() => {
        if (device === null) {
            return {device, sections: [], panel: null};
        }

        const applicable = new Map(panelsFor({device, snapshot}).map(panel => [panel.id, panel]));

        const sections = PANEL_SECTIONS
            .map(section => ({title: section.title, panels: section.panels.flatMap(id => applicable.get(id) ?? [])}))
            .filter(section => section.panels.length > 0);

        return {device, sections, panel: applicable.get(panelId) ?? applicable.get(DEFAULT_PANEL) ?? null};
    }, [device, snapshot, panelId]);
}
