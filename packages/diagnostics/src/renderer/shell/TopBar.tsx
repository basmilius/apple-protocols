import { useMemo } from 'react';
import { Home, KeyRound, Plug, PlugZap, RefreshCw } from 'lucide-react';
import { ProjectSwitcher, ProjectSwitcherGroups, type ProjectSwitcherItem, WindowControlsSpacer, WorkspaceTopRow } from '@adecore/ui';
import { useDevice } from '@/panels/hooks';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import type { PanelDefinition } from '@/panels/registry';
import { Button, Icon, IconButton, MenuItem, MenuSeparator, StatusPill } from '@/ui';
import { DeviceIcon } from './DeviceIcon';

/** Devices with a session come first in the menu, then the paired ones, then the rest. */
type DeviceItem = ProjectSwitcherItem & {
    readonly rank: 'session' | 'paired' | 'other';
};

function DeviceSwitcher() {
    const devices = useDevices(state => state.devices);
    const scanning = useDevices(state => state.scanning);
    const scan = useDevices(state => state.scan);
    const connect = useDevices(state => state.connect);
    const disconnect = useDevices(state => state.disconnect);
    const deviceId = useLayout(state => state.deviceId);
    const selectDevice = useLayout(state => state.selectDevice);
    const show = useLayout(state => state.show);

    const items = useMemo<DeviceItem[]>(
        () =>
            devices.map(device => {
                const connected = device.session === 'connected';

                return {
                    rank: device.session !== 'disconnected' ? 'session' : device.paired.length > 0 ? 'paired' : 'other',
                    id: device.id,
                    name: device.name,
                    icon: <DeviceIcon device={device}/>,
                    hint: device.address,
                    muted: device.session === 'disconnected',
                    actions: (
                        <>
                            <MenuItem onClick={() => void (connected ? disconnect(device.id) : connect(device.id))}>
                                <Icon icon={connected ? Plug : PlugZap} size={14}/>
                                {connected ? 'Disconnect' : 'Connect'}
                            </MenuItem>
                            <MenuItem
                                onClick={() => {
                                    selectDevice(device.id);
                                    show('pairing');
                                }}
                            >
                                <Icon icon={KeyRound} size={14}/>
                                Pairing
                            </MenuItem>
                        </>
                    )
                };
            }),
        [devices, connect, disconnect, selectDevice, show]
    );

    const select = (item: DeviceItem): void => selectDevice(item.id);

    return (
        <ProjectSwitcher
            label="Devices"
            current={items.find(item => item.id === deviceId) ?? null}
            projects={items.filter(item => item.rank === 'session')}
            onSelect={select}
            // The theme hides a separator that has no rows on one of its sides, so an empty group leaves no line.
            before={
                <>
                    <ProjectSwitcherGroups projects={items.filter(item => item.rank === 'paired')} onSelect={select}/>
                    <MenuSeparator/>
                    <ProjectSwitcherGroups projects={items.filter(item => item.rank === 'other')} onSelect={select}/>
                </>
            }
        >
            <MenuItem disabled={scanning} onClick={() => void scan(true)}>
                <Icon icon={RefreshCw} size={14}/>
                Rescan
            </MenuItem>
        </ProjectSwitcher>
    );
}

export function TopBar({panel}: { readonly panel: PanelDefinition | null }) {
    const deviceId = useLayout(state => state.deviceId);
    const selectDevice = useLayout(state => state.selectDevice);
    const {device, snapshot, connected, busy, connect, disconnect} = useDevice(deviceId);

    return (
        <WorkspaceTopRow
            slotless
            // The sidebar stands at the left edge while a device is open, and clears the window's controls itself.
            leading={device === null ? <WindowControlsSpacer/> : <IconButton icon={Home} label="Back to the start screen" onClick={() => selectDevice(null)}/>}
        >
            <DeviceSwitcher/>
            {device && panel && (
                <>
                    <span className="text-text-faint">/</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Icon icon={panel.icon} size={14}/>
                        <span className="truncate">{panel.title}</span>
                    </span>
                </>
            )}
            <span className="grow"/>
            {device && (
                <>
                    <StatusPill status={connected ? 'ok' : snapshot?.connection.status === 'failed' ? 'error' : snapshot?.connection.status === 'connecting' || snapshot?.connection.status === 'recovering' ? 'busy' : 'off'}>
                        {snapshot?.connection.status ?? 'disconnected'}
                    </StatusPill>
                    <Button variant={connected ? 'secondary' : 'primary'} size="sm" disabled={busy} onClick={() => void (connected ? disconnect() : connect())}>
                        <Icon icon={connected ? Plug : PlugZap} size={14}/>
                        {connected ? 'Disconnect' : 'Connect'}
                    </Button>
                </>
            )}
        </WorkspaceTopRow>
    );
}
