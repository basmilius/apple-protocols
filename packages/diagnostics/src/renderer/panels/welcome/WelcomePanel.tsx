import { MonitorSpeaker, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@adecore/ui';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { TOOLS_PANELS } from '@/panels/registry.tools';
import { DeviceIcon } from '@/shell/DeviceIcon';
import { EmptyState, Icon, IconButton, Section, Tile } from '@/ui';

export function WelcomePanel() {
    const devices = useDevices(state => state.devices);
    const scanning = useDevices(state => state.scanning);
    const scan = useDevices(state => state.scan);
    const selectDevice = useLayout(state => state.selectDevice);
    const tool = useLayout(state => state.tool);
    const toggleTool = useLayout(state => state.toggleTool);

    return (
        <ScrollArea className="h-full" viewportClassName="mx-auto flex w-full max-w-[1000px] flex-col gap-5 p-6">
            <Section
                title="Devices"
                actions={<IconButton icon={RefreshCw} label="Rescan" size="sm" disabled={scanning} className={scanning ? 'animate-spin' : undefined} onClick={() => void scan(true)}/>}
            >
                {devices.length === 0 ? (
                    <EmptyState icon={<Icon icon={MonitorSpeaker} size={20}/>}>
                        {scanning ? 'Looking for Apple TVs and HomePods.' : 'No devices found yet. Rescan to look again.'}
                    </EmptyState>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {devices.map(device => (
                            <Tile
                                key={device.id}
                                icon={<DeviceIcon device={device} size={16}/>}
                                title={device.name}
                                description={device.address}
                                onClick={() => selectDevice(device.id)}
                            />
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Tools">
                <div className="grid grid-cols-2 gap-2">
                    {TOOLS_PANELS.map(panel => (
                        <Tile
                            key={panel.id}
                            size="sm"
                            icon={<Icon icon={panel.icon} size={14}/>}
                            title={panel.title}
                            onClick={() => {
                                if (tool !== panel.id) {
                                    toggleTool(panel.id);
                                }
                            }}
                        />
                    ))}
                </div>
            </Section>
        </ScrollArea>
    );
}
