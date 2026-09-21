import { useMemo, useState, type ReactElement } from 'react';
import clsx from 'clsx';
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { PANEL_GROUP_LABELS, type PanelGroup, panelsFor } from '@/panels/registry';
import { BTN_GROUP, ContextMenu, ContextMenuItem, Icon, IconButton, MenuSeparator, Select, type SelectGroup, type SelectItem, shortcut } from '@/ui';
import { setDragging, writeCell } from './cell-drag';
import type { CellAt, SplitCell } from './split';

/* Do not start a cell drag from interactive controls. */
const CONTROLS = 'input, textarea, select, button, a, [role="button"], [role="combobox"]';

/** The value the device picker uses for "no device", since a `Select` needs a string. */
const NO_DEVICE = '';

export function CellToolbar({at, cell, focused, children}: { readonly at: CellAt; readonly cell: SplitCell; readonly focused: boolean; readonly children: ReactElement }) {
    const devices = useDevices(state => state.devices);
    const snapshots = useDevices(state => state.snapshots);
    const setCell = useLayout(state => state.setCell);
    const close = useLayout(state => state.close);
    const split = useLayout(state => state.split);
    /* Remove `draggable` while a control is pressed; otherwise the nearest draggable ancestor starts a cell drag. */
    const [grabbable, setGrabbable] = useState(true);

    const deviceItems = useMemo<SelectItem<string>[]>(
        () => [{value: NO_DEVICE, label: 'No device'}, ...devices.map(device => ({value: device.id, label: device.name, description: device.address}))],
        [devices]
    );

    const panelItems = useMemo<SelectGroup<string>[]>(() => {
        const device = cell.deviceId === null ? null : (devices.find(candidate => candidate.id === cell.deviceId) ?? null);
        const snapshot = cell.deviceId === null ? null : (snapshots[cell.deviceId] ?? null);
        const groups = new Map<PanelGroup, SelectItem<string>[]>();

        for (const panel of panelsFor({device, snapshot})) {
            const items = groups.get(panel.group) ?? [];
            items.push({value: panel.id, label: panel.title, icon: <Icon icon={panel.icon} size={14}/>});
            groups.set(panel.group, items);
        }

        return Array.from(groups.entries()).map(([group, items]) => ({label: PANEL_GROUP_LABELS[group], items}));
    }, [cell.deviceId, devices, snapshots]);

    const header = (
        <header
            draggable={grabbable}
            aria-label="Move this cell"
            className={clsx(
                'flex h-10 shrink-0 cursor-grab items-center gap-1 overflow-hidden border-b border-border pr-1.5 pl-2 text-xs active:cursor-grabbing',
                focused ? 'bg-surface text-text' : 'bg-surface-idle text-text-muted'
            )}
            onPointerDown={event => setGrabbable(!(event.target as HTMLElement | null)?.closest(CONTROLS))}
            onPointerUp={() => setGrabbable(true)}
            onDragStart={event => writeCell(event.dataTransfer, {deviceId: cell.deviceId, panelId: cell.panelId})}
            onDragEnd={() => setDragging(null)}
        >
            <Select
                label="Device"
                variant="ghost"
                size="sm"
                value={cell.deviceId ?? NO_DEVICE}
                items={deviceItems}
                onValueChange={value => {
                    const deviceId = value === NO_DEVICE ? null : value;
                    const applicable = panelsFor({
                        device: deviceId === null ? null : (devices.find(candidate => candidate.id === deviceId) ?? null),
                        snapshot: deviceId === null ? null : (snapshots[deviceId] ?? null)
                    });
                    // The panel that was showing may not apply to the device that just arrived.
                    const panelId = applicable.some(panel => panel.id === cell.panelId) ? cell.panelId : (applicable[0]?.id ?? 'welcome');
                    setCell(at, {deviceId, panelId});
                }}
            />
            <Select
                label="Panel"
                variant="ghost"
                size="sm"
                value={cell.panelId}
                items={panelItems}
                onValueChange={value => setCell(at, {panelId: value})}
            />
            <span className={clsx(BTN_GROUP, 'ml-auto')}>
                <IconButton icon={SplitSquareHorizontal} label={`Split right (${shortcut('Mod+\\')})`} size="sm" onClick={() => split('right', at)}/>
                <IconButton icon={SplitSquareVertical} label={`Split down (${shortcut('Mod+Shift+\\')})`} size="sm" onClick={() => split('down', at)}/>
                <IconButton icon={X} label={`Close cell (${shortcut('Mod+W')})`} size="sm" onClick={() => close(at)}/>
            </span>
        </header>
    );

    return (
        <>
            <ContextMenu trigger={header}>
                <ContextMenuItem onClick={() => split('right', at)}>Split right</ContextMenuItem>
                <ContextMenuItem onClick={() => split('down', at)}>Split down</ContextMenuItem>
                <MenuSeparator/>
                <ContextMenuItem onClick={() => close(at)}>Close cell</ContextMenuItem>
            </ContextMenu>
            {children}
        </>
    );
}
