import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronRight, Monitor, MonitorSpeaker, RefreshCw, Speaker } from 'lucide-react';
import type { DeviceSessionStatus, DiscoveredDeviceInfo, DeviceType } from '@shared/contract';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { PANEL_GROUP_LABELS, type PanelDefinition, type PanelGroup, panelsFor } from '@/panels/registry';
import { TOOLS_PANELS } from '@/panels/registry.tools';
import { BRAND, EmptyState, Icon, IconButton, META, SECTION_LABEL, Tooltip } from '@/ui';
import { writeCell } from './cell-drag';
import { cellKey } from './split';

/** 248 pixels, wide enough for a device name and its two protocol badges on one row. */
export const SIDEBAR_WIDTH = 248;

/* The traffic lights sit over the left of the title strip, so the wordmark starts past them. */
const TRAFFIC_LIGHT_INSET = 80;

/* Every row in the list: one height, one radius, one indent. A child row adds `pl-8`, which puts
   its icon under the first letter of the device name. */
const ROW = 'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm';
/* Every row opens with the same 16px column, so a device and a panel under it line up one indent
   apart. The height comes from the row, which is one line on a panel and two on a device. */
const ICON_SLOT = 'grid w-4 shrink-0 place-items-center';
/* The line height of `text-sm`: what keeps the icon of a two-line row on the name rather than
   between the two lines. */
const NAME_LINE = 'h-5.5';
const ROW_SELECTED = 'bg-surface-active text-text';
/* Standing in a cell beside the focused one: the name at full strength, the background left empty,
   so it reads as open without claiming to be the row the keyboard is on. */
const ROW_BESIDE = 'text-text hover:bg-surface-hover';
const ROW_PLAIN = 'text-text-muted hover:bg-surface-hover hover:text-text';

const TYPE_ICON: Record<DeviceType, typeof Monitor> = {
    appletv: Monitor,
    homepod: Speaker,
    'homepod-mini': Speaker,
    unknown: MonitorSpeaker
};

/* What the session is doing, drawn on the device's own mark rather than on a dot beside it: the row
   already carries a name, a pair of tags and an address, and a fourth thing to read is one too many. */
const SESSION_COLOR: Record<DeviceSessionStatus, string | undefined> = {
    disconnected: undefined,
    connecting: 'text-status-needs-you',
    connected: 'text-status-idle',
    recovering: 'text-status-needs-you',
    failed: 'text-status-error'
};

/* The protocols a device is paired over. They say what is stored, not what is happening, so they
   stay gray: the color in a row belongs to the session. */
const PAIRED_TAG = 'inline-flex shrink-0 items-center rounded-sm bg-surface-sunken px-1 text-2xs font-medium text-text-muted';

/* A tool works on what is pasted into it rather than on a device, so it gets a section of its own
   instead of repeating under every device. */
type RowState = 'active' | 'beside' | 'plain';

const ROW_STATE: Record<RowState, string> = {
    active: ROW_SELECTED,
    beside: ROW_BESIDE,
    plain: ROW_PLAIN
};

function SectionLabel({title, actions, className}: { readonly title: string; readonly actions?: ReactNode; readonly className?: string }) {
    return (
        <div className={clsx('flex h-7 shrink-0 items-center gap-2 px-2', className)}>
            <h2 className={clsx(SECTION_LABEL, 'uppercase tracking-wide')}>{title}</h2>
            {actions && <span className="ml-auto flex items-center">{actions}</span>}
        </div>
    );
}

/* The label over one run of a device's panels. Smaller and shorter than the labels over the two
   top-level sections, so it divides without reading as a section of its own. */
function GroupLabel({title, className}: { readonly title: string; readonly className?: string }) {
    return (
        <div className={clsx('flex h-5 shrink-0 items-center pl-8', className)}>
            <h3 className="text-2xs font-medium tracking-wide text-text-faint uppercase">{title}</h3>
        </div>
    );
}

function PanelRow({panel, deviceId, state}: { readonly panel: PanelDefinition; readonly deviceId: string | null; readonly state: RowState }) {
    const show = useLayout(store => store.show);

    return (
        <button
            type="button"
            draggable
            aria-current={state === 'active' ? 'true' : undefined}
            className={clsx(ROW, deviceId !== null && 'pl-8', ROW_STATE[state])}
            onDragStart={event => writeCell(event.dataTransfer, {deviceId, panelId: panel.id})}
            onClick={() => show({deviceId, panelId: panel.id})}
        >
            <span className={clsx(ICON_SLOT, 'h-4')}>
                <Icon icon={panel.icon} size={14}/>
            </span>
            <span className="min-w-0 truncate">{panel.title}</span>
        </button>
    );
}

function DeviceRow({device, expanded, state, onToggle}: {
    readonly device: DiscoveredDeviceInfo;
    readonly expanded: boolean;
    readonly state: RowState;
    readonly onToggle: () => void;
}) {
    const show = useLayout(store => store.show);

    return (
        <button
            type="button"
            draggable
            aria-expanded={expanded}
            aria-current={state === 'active' ? 'true' : undefined}
            className={clsx(ROW, 'group h-auto min-h-10 items-start py-1 font-medium', ROW_STATE[state])}
            onDragStart={event => writeCell(event.dataTransfer, {deviceId: device.id, panelId: 'overview'})}
            onClick={() => {
                show({deviceId: device.id, panelId: 'overview'});

                if (!expanded) {
                    onToggle();
                }
            }}
            onKeyDown={event => {
                if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && expanded !== (event.key === 'ArrowRight')) {
                    event.preventDefault();
                    onToggle();
                }
            }}
        >
            {/* One slot at the row's left edge: the mark of the device, and the chevron in its place
                under the pointer, so a folded row and an open one read the same at rest. The padding
                grows that target to 24 pixels and the negative margin gives the space back. */}
            <span
                role="presentation"
                className={clsx(ICON_SLOT, NAME_LINE, '-mx-1 box-content rounded-md px-1 hover:bg-surface-hover')}
                onClick={event => {
                    event.stopPropagation();
                    onToggle();
                }}
            >
                <Icon icon={TYPE_ICON[device.deviceType]} size={14} className={clsx('col-start-1 row-start-1 group-hover:hidden group-focus-visible:hidden', SESSION_COLOR[device.session])}/>
                <Icon icon={ChevronRight} size={14} className={clsx('col-start-1 row-start-1 hidden group-hover:block group-focus-visible:block', expanded && 'rotate-90')}/>
            </span>
            <span className="flex min-w-0 grow flex-col">
                <span className={clsx('flex items-center truncate', NAME_LINE)}>{device.name}</span>
                <span className={clsx('truncate', META)}>{device.address}</span>
            </span>
            <span className={clsx('flex shrink-0 items-center gap-1', NAME_LINE)}>
                {device.paired.map(protocol => (
                    <Tooltip key={protocol} label={`Paired over ${protocol === 'airplay' ? 'AirPlay' : 'Companion Link'}`}>
                        <span className={PAIRED_TAG}>{protocol === 'airplay' ? 'AP' : 'CL'}</span>
                    </Tooltip>
                ))}
            </span>
        </button>
    );
}

/* The panels that apply to one device, in the order the registry lists them, under the label of the
   group each run belongs to. */
function DevicePanels({device, focusedKey, openKeys}: {
    readonly device: DiscoveredDeviceInfo;
    readonly focusedKey: string | null;
    readonly openKeys: ReadonlySet<string>;
}) {
    const snapshots = useDevices(store => store.snapshots);
    const snapshot = snapshots[device.id] ?? null;

    const groups = useMemo(() => {
        const byGroup = new Map<PanelGroup, PanelDefinition[]>();

        for (const panel of panelsFor({device, snapshot})) {
            if (panel.group === 'tools') {
                continue;
            }

            const items = byGroup.get(panel.group) ?? [];
            items.push(panel);
            byGroup.set(panel.group, items);
        }

        return Array.from(byGroup.entries());
    }, [device, snapshot]);

    return (
        <>
            {groups.map(([group, panels], index) => (
                <div key={group} className="flex flex-col gap-px">
                    {/* The first label follows the device row it belongs to, so it only needs the
                        hairline of air; the ones after it separate two blocks. */}
                    <GroupLabel title={PANEL_GROUP_LABELS[group]} className={index === 0 ? 'mt-0.5' : 'mt-2'}/>
                    {panels.map(panel => {
                        const key = cellKey({deviceId: device.id, panelId: panel.id});

                        return <PanelRow key={panel.id} panel={panel} deviceId={device.id} state={key === focusedKey ? 'active' : openKeys.has(key) ? 'beside' : 'plain'}/>;
                    })}
                </div>
            ))}
        </>
    );
}

/* The device list, the tools beside it, and the controls that belong to the app rather than to a
   panel. */
export function Sidebar() {
    const devices = useDevices(store => store.devices);
    const scanning = useDevices(store => store.scanning);
    const scan = useDevices(store => store.scan);
    const layout = useLayout(store => store.layout);
    const expanded = useLayout(store => store.expanded);
    const toggleExpanded = useLayout(store => store.toggleExpanded);

    const openKeys = useMemo(() => new Set(layout.columns.flatMap(column => column.cells.map(cell => cellKey(cell)))), [layout]);
    const focused = layout.columns[layout.focus.column]?.cells[layout.focus.cell] ?? null;
    const focusedKey = focused === null ? null : cellKey(focused);
    /* The device in the focused cell is unfolded whatever the stored set says, so the panels of what
       is on screen are never a click away. */
    const expandedIds = useMemo(() => new Set(focused?.deviceId === undefined || focused.deviceId === null ? expanded : [...expanded, focused.deviceId]), [expanded, focused]);

    return (
        <aside className="flex h-full shrink-0 flex-col border-r border-border bg-surface" style={{width: SIDEBAR_WIDTH}}>
            <div className="app-drag flex h-12 shrink-0 items-center pr-2" style={{paddingLeft: TRAFFIC_LIGHT_INSET}}>
                <span className={clsx(BRAND, 'pointer-events-none')}>DIAGNOSTICS</span>
            </div>
            <div className="mt-2 flex min-h-0 grow flex-col gap-3 overflow-auto px-2 pb-2">
                <div className="flex flex-col gap-px">
                    <SectionLabel
                        title="Devices"
                        actions={<IconButton icon={RefreshCw} label="Rescan" size="sm" disabled={scanning} onClick={() => void scan(true)} className={scanning ? 'animate-spin' : undefined}/>}
                    />
                    {devices.length === 0 ? (
                        <EmptyState>{scanning ? 'Looking for Apple TVs and HomePods.' : 'No devices found yet. Rescan to look again.'}</EmptyState>
                    ) : (
                        devices.map(device => {
                            const key = cellKey({deviceId: device.id, panelId: 'overview'});
                            const open = expandedIds.has(device.id);

                            return (
                                /* An unfolded device ends in a gap, so its last panel does not read
                                   as the row of the device under it. */
                                <div key={device.id} className={clsx('flex flex-col gap-px', open && 'pb-3')}>
                                    <DeviceRow
                                        device={device}
                                        expanded={open}
                                        state={key === focusedKey ? 'active' : openKeys.has(key) ? 'beside' : 'plain'}
                                        onToggle={() => toggleExpanded(device.id)}
                                    />
                                    {open && <DevicePanels device={device} focusedKey={focusedKey} openKeys={openKeys}/>}
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="flex flex-col gap-px">
                    <SectionLabel title="Tools"/>
                    {TOOLS_PANELS.map(panel => {
                        const key = cellKey({deviceId: null, panelId: panel.id});

                        return <PanelRow key={panel.id} panel={panel} deviceId={null} state={key === focusedKey ? 'active' : openKeys.has(key) ? 'beside' : 'plain'}/>;
                    })}
                </div>
            </div>
        </aside>
    );
}
