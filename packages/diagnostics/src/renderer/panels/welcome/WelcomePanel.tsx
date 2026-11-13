import { useEffect, useMemo, useState } from 'react';
import { MonitorSpeaker, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@adecore/ui';
import type { DiscoveredDeviceInfo, StoredDeviceInfo } from '@shared/contract';
import { invoke } from '@/client';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { DeviceIcon } from '@/shell/DeviceIcon';
import { EmptyState, Icon, IconButton, ICONS, KeyValue, KeyValueList, MiddleTruncate, Pill, Section, StatusPill, Tile } from '@/ui';

/* The same order as the device switcher: a live session first, then paired devices, then the rest; names keep the store's order. */
const rankOf = (device: DiscoveredDeviceInfo): number => (device.session !== 'disconnected' ? 0 : device.paired.length > 0 ? 1 : 2);

function DeviceSummary({device}: { readonly device: DiscoveredDeviceInfo }) {
    return (
        <span className="flex flex-col gap-1.5">
            <span className="mono">{device.address}</span>
            <span className="flex flex-wrap gap-1">
                {device.session !== 'disconnected' && <StatusPill status={device.session === 'connected' ? 'ok' : device.session === 'failed' ? 'error' : 'busy'}>{device.session}</StatusPill>}
                {device.paired.map(protocol => (
                    <Pill key={protocol} tone="accent" icon={<Icon icon={ICONS.credentials} size={12}/>}>
                        {protocol === 'airplay' ? 'AirPlay' : 'Companion Link'}
                    </Pill>
                ))}
                {device.modelName && <Pill tone="muted">{device.modelName}</Pill>}
            </span>
        </span>
    );
}

export function WelcomePanel() {
    const devices = useDevices(state => state.devices);
    const scanning = useDevices(state => state.scanning);
    const scan = useDevices(state => state.scan);
    const selectDevice = useLayout(state => state.selectDevice);
    const [stored, setStored] = useState<readonly StoredDeviceInfo[]>([]);

    useEffect(() => {
        void invoke('storage:devices', undefined).then(setStored, () => setStored([]));
    }, [devices]);

    const ordered = useMemo(() => [...devices].sort((first, second) => rankOf(first) - rankOf(second)), [devices]);
    const missing = useMemo(() => stored.filter(entry => !devices.some(device => device.id === entry.identifier)), [stored, devices]);

    return (
        <ScrollArea className="h-full" viewportClassName="mx-auto flex w-full max-w-[1000px] flex-col gap-5 p-6">
            <Section
                title="Devices"
                icon={MonitorSpeaker}
                actions={<IconButton icon={RefreshCw} label="Rescan" size="sm" disabled={scanning} className={scanning ? 'animate-spin' : undefined} onClick={() => void scan(true)}/>}
            >
                {devices.length === 0 ? (
                    <EmptyState icon={MonitorSpeaker} busy={scanning}>
                        {scanning ? 'Looking for Apple TVs and HomePods.' : 'No devices found yet. Rescan to look again.'}
                    </EmptyState>
                ) : (
                    <div className="grid grid-cols-1 gap-2 @[560px]:grid-cols-2">
                        {ordered.map(device => (
                            <Tile key={device.id} icon={<DeviceIcon device={device} size={16}/>} title={device.name} description={<DeviceSummary device={device}/>} onClick={() => selectDevice(device.id)}/>
                        ))}
                    </div>
                )}
            </Section>

            {missing.length > 0 && (
                <Section title="Paired, not found" icon={ICONS.credentials}>
                    <p className="text-xs text-text-muted">These devices have credentials stored but did not answer the last scan. Rescan, or wake them from the mDNS tool.</p>
                    <KeyValueList>
                        {missing.map(entry => (
                            <KeyValue key={entry.identifier} label={entry.name} mono>
                                <MiddleTruncate text={entry.identifier}/>
                            </KeyValue>
                        ))}
                    </KeyValueList>
                </Section>
            )}
        </ScrollArea>
    );
}
